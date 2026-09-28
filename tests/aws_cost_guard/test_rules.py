from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from aws_cost_guard.cost_explorer import CostSummary
from aws_cost_guard.inventory import InventoryResult
from aws_cost_guard.rules import evaluate_inventory

FIXTURE = Path(__file__).parent / "fixtures" / "sample_inventory.json"


def load_inventory() -> InventoryResult:
    return InventoryResult(**json.loads(FIXTURE.read_text(encoding="utf-8")))


def low_cost_summary() -> CostSummary:
    return CostSummary(
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 30),
        total_unblended=Decimal("103.45"),
        total_net_unblended=Decimal("52.40"),
    )


def test_load_balancer_rules_flag_active_and_idle_albs() -> None:
    findings = evaluate_inventory(load_inventory(), low_cost_summary())

    assert any(
        finding.resource_type == "load_balancer"
        and finding.estimated_recurring == "yes"
        and finding.confidence == "high"
        for finding in findings
    )
    assert any(
        finding.resource_type == "load_balancer"
        and "RequestCount" in finding.why_it_matters
        and finding.severity == "high"
        for finding in findings
    )


def test_nat_gateway_rules_flag_recurring_and_low_traffic_waste() -> None:
    findings = evaluate_inventory(load_inventory(), low_cost_summary())

    nat_findings = [finding for finding in findings if finding.resource_type == "nat_gateway"]
    assert any(finding.severity == "high" for finding in nat_findings)
    assert any("low-traffic" in finding.why_it_matters for finding in nat_findings)


def test_public_ip_rules_flag_public_ipv4_and_unassociated_eip() -> None:
    findings = evaluate_inventory(load_inventory(), low_cost_summary())

    assert any(finding.resource_type == "public_ipv4" for finding in findings)
    assert any(
        finding.resource_type == "elastic_ip" and "not associated" in finding.why_it_matters
        for finding in findings
    )


def test_compute_storage_and_database_rules() -> None:
    findings = evaluate_inventory(load_inventory(), low_cost_summary())

    assert any(finding.resource_type == "ec2_instance" for finding in findings)
    assert any(finding.resource_type == "ebs_volume" for finding in findings)
    assert any(
        finding.resource_type == "rds_instance" and "DBConnections" in finding.why_it_matters
        for finding in findings
    )


def test_ecs_ecr_and_route53_rules() -> None:
    findings = evaluate_inventory(
        load_inventory(),
        low_cost_summary(),
        now=datetime(2026, 7, 4, tzinfo=UTC),
    )

    assert any(finding.resource_type == "ecs_service" for finding in findings)
    assert any(
        finding.resource_type == "ecs_service"
        and "Desired count above one" in finding.why_it_matters
        for finding in findings
    )
    assert any(finding.resource_type == "ecr_repository" for finding in findings)
    assert any(finding.resource_type == "route53_hosted_zone" for finding in findings)


def test_duplicate_shape_rules_flag_same_app_environment_resources() -> None:
    findings = evaluate_inventory(load_inventory(), low_cost_summary())

    duplicate_findings = [
        finding
        for finding in findings
        if "same app or environment shape" in finding.why_it_matters
    ]
    assert {finding.resource_type for finding in duplicate_findings} >= {
        "load_balancer",
        "nat_gateway",
        "rds_instance",
        "ecs_service",
    }
