from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from aws_cost_guard.cost_explorer import CostSummary
from aws_cost_guard.inventory import InventoryResult

Severity = str
Confidence = str
RecurringNature = str

ALB_NEAR_ZERO_REQUESTS_30D = 10
RDS_NEAR_ZERO_CONNECTIONS = 0.1
ECR_MANY_IMAGES = 50
ECR_OLD_IMAGE_DAYS = 90
LOW_TRAFFIC_MONTHLY_GROSS = Decimal("200")


@dataclass(slots=True)
class Finding:
    severity: Severity
    confidence: Confidence
    resource_type: str
    resource_id: str
    estimated_recurring: RecurringNature
    why_it_matters: str
    safe_next_action: str
    manual_confirmation_required: bool
    region: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "confidence": self.confidence,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "region": self.region,
            "estimated_recurring": self.estimated_recurring,
            "why_it_matters": self.why_it_matters,
            "safe_next_action": self.safe_next_action,
            "manual_confirmation_required": self.manual_confirmation_required,
            "evidence": self.evidence,
        }


def evaluate_inventory(
    inventory: InventoryResult,
    cost_summary: CostSummary | None = None,
    *,
    now: datetime | None = None,
) -> list[Finding]:
    now = now or datetime.now(UTC)
    findings: list[Finding] = []
    low_traffic = _is_low_traffic(cost_summary)

    findings.extend(_load_balancer_findings(inventory))
    findings.extend(_nat_gateway_findings(inventory, low_traffic))
    findings.extend(_public_ip_findings(inventory))
    findings.extend(_ec2_findings(inventory))
    findings.extend(_ebs_findings(inventory))
    findings.extend(_rds_findings(inventory))
    findings.extend(_ecs_findings(inventory, low_traffic))
    findings.extend(_ecr_findings(inventory, now))
    findings.extend(_route53_findings(inventory))
    findings.extend(_duplicate_shape_findings(inventory))

    return sorted(findings, key=_finding_sort_key)


def _load_balancer_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for lb in inventory.load_balancers:
        state = lb.get("state")
        lb_type = lb.get("type")
        resource_id = lb.get("arn") or lb.get("name") or "unknown-load-balancer"
        if state == "active" and lb_type in {"application", "network"}:
            findings.append(
                Finding(
                    severity="medium",
                    confidence="high",
                    resource_type="load_balancer",
                    resource_id=resource_id,
                    region=lb.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "Active ALB/NLB resources have recurring hourly charges and can also "
                        "drive processed-byte or LCU charges."
                    ),
                    safe_next_action=(
                        "Confirm DNS, listener, target group, and ECS/service dependencies before "
                        "planning consolidation or removal."
                    ),
                    manual_confirmation_required=True,
                    evidence={
                        "name": lb.get("name"),
                        "type": lb_type,
                        "scheme": lb.get("scheme"),
                        "listeners": len(lb.get("listeners", [])),
                        "target_groups": len(lb.get("target_groups", [])),
                    },
                )
            )

        request_count_30d = lb.get("metrics", {}).get("request_count_30d")
        if (
            lb_type == "application"
            and state == "active"
            and request_count_30d is not None
            and request_count_30d <= ALB_NEAR_ZERO_REQUESTS_30D
        ):
            findings.append(
                Finding(
                    severity="high",
                    confidence="high",
                    resource_type="load_balancer",
                    resource_id=resource_id,
                    region=lb.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "This ALB appears idle or nearly idle based on CloudWatch "
                        f"RequestCount over 30 days ({request_count_30d:g})."
                    ),
                    safe_next_action=(
                        "Check access logs, DNS records, health checks, and target groups; "
                        "if no live traffic depends on it, prepare a removal plan."
                    ),
                    manual_confirmation_required=True,
                    evidence={"request_count_30d": request_count_30d},
                )
            )
    return findings


def _nat_gateway_findings(inventory: InventoryResult, low_traffic: bool) -> list[Finding]:
    findings: list[Finding] = []
    for nat in inventory.nat_gateways:
        if nat.get("state") not in {"available", "pending"}:
            continue
        resource_id = nat.get("id") or "unknown-nat-gateway"
        findings.append(
            Finding(
                severity="high",
                confidence="high",
                resource_type="nat_gateway",
                resource_id=resource_id,
                region=nat.get("region"),
                estimated_recurring="yes",
                why_it_matters=(
                    "NAT gateways have recurring hourly charges plus data processing charges even "
                    "when they serve small environments."
                ),
                safe_next_action=(
                    "Confirm private subnet egress requirements and consider whether VPC "
                    "endpoints, a smaller architecture, or no NAT is appropriate."
                ),
                manual_confirmation_required=True,
                evidence={"vpc_id": nat.get("vpc_id"), "subnet_id": nat.get("subnet_id")},
            )
        )
        if low_traffic or _resource_has_dev_signal(nat):
            findings.append(
                Finding(
                    severity="medium",
                    confidence="medium" if low_traffic else "high",
                    resource_type="nat_gateway",
                    resource_id=resource_id,
                    region=nat.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "A NAT gateway in a low-traffic or dev-like account is often one of the "
                        "largest recurring fixed network costs."
                    ),
                    safe_next_action=(
                        "Validate outbound traffic needs, then compare endpoint-only or "
                        "public-subnet dev alternatives before changing the network."
                    ),
                    manual_confirmation_required=True,
                    evidence={"low_traffic_period": low_traffic, "tags": nat.get("tags", {})},
                )
            )
    return findings


def _public_ip_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for address in inventory.elastic_ips:
        resource_id = address.get("allocation_id") or address.get("public_ip") or "unknown-eip"
        associated = bool(address.get("association_id"))
        findings.append(
            Finding(
                severity="medium",
                confidence="high",
                resource_type="elastic_ip",
                resource_id=resource_id,
                region=address.get("region"),
                estimated_recurring="yes",
                why_it_matters=(
                    "Public IPv4 addresses and Elastic IPs can create recurring charges whether "
                    "or not the associated workload is busy."
                ),
                safe_next_action=(
                    "Confirm whether the address is still required for DNS, allowlists, or static "
                    "egress before changing it."
                ),
                manual_confirmation_required=True,
                evidence={"public_ip": address.get("public_ip"), "associated": associated},
            )
        )
        if not associated:
            findings.append(
                Finding(
                    severity="high",
                    confidence="high",
                    resource_type="elastic_ip",
                    resource_id=resource_id,
                    region=address.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "This Elastic IP is not associated with a running resource, so it is a "
                        "strong waste candidate."
                    ),
                    safe_next_action=(
                        "Confirm no DNS record or allowlist still expects this IP, then release it "
                        "through the AWS console or IaC."
                    ),
                    manual_confirmation_required=True,
                    evidence={"public_ip": address.get("public_ip")},
                )
            )

    for instance in inventory.ec2_instances:
        if instance.get("public_ip") and instance.get("state") == "running":
            findings.append(
                Finding(
                    severity="medium",
                    confidence="high",
                    resource_type="public_ipv4",
                    resource_id=instance.get("id") or instance.get("public_ip"),
                    region=instance.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "A running EC2 instance with a public IPv4 address can contribute "
                        "recurring public IPv4 charges."
                    ),
                    safe_next_action=(
                        "Check whether the instance truly needs direct public ingress, or whether "
                        "it can sit behind an existing load balancer or private access path."
                    ),
                    manual_confirmation_required=True,
                    evidence={
                        "public_ip": instance.get("public_ip"),
                        "subnet_id": instance.get("subnet_id"),
                    },
                )
            )
    return findings


def _ec2_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for instance in inventory.ec2_instances:
        if instance.get("state") != "running":
            continue
        findings.append(
            Finding(
                severity="medium",
                confidence="high",
                resource_type="ec2_instance",
                resource_id=instance.get("id") or "unknown-instance",
                region=instance.get("region"),
                estimated_recurring="yes",
                why_it_matters="Running EC2 instances accrue compute charges while they remain on.",
                safe_next_action=(
                    "Confirm the owner and workload, then right-size, schedule, or stop only after "
                    "validating service impact."
                ),
                manual_confirmation_required=True,
                evidence={
                    "instance_type": instance.get("type"),
                    "launch_time": instance.get("launch_time"),
                    "tags": instance.get("tags", {}),
                },
            )
        )
    return findings


def _ebs_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for volume in inventory.ebs_volumes:
        findings.append(
            Finding(
                severity="medium",
                confidence="high",
                resource_type="ebs_volume",
                resource_id=volume.get("id") or "unknown-volume",
                region=volume.get("region"),
                estimated_recurring="yes",
                why_it_matters=(
                    "Available EBS volumes are unattached but still accrue storage charges."
                ),
                safe_next_action=(
                    "Confirm there is a snapshot or no recovery need, then delete through normal "
                    "AWS or IaC workflows."
                ),
                manual_confirmation_required=True,
                evidence={
                    "size_gib": volume.get("size_gib"),
                    "volume_type": volume.get("volume_type"),
                    "created_at": volume.get("created_at"),
                },
            )
        )
    return findings


def _rds_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for db in inventory.rds_instances:
        if db.get("status") == "available":
            findings.append(
                Finding(
                    severity="high",
                    confidence="high",
                    resource_type="rds_instance",
                    resource_id=db.get("id") or "unknown-rds",
                    region=db.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "Available RDS instances accrue database compute and storage charges."
                    ),
                    safe_next_action=(
                        "Identify owners and dependencies, verify backups, then consider stopping, "
                        "downsizing, or retiring through a planned database change."
                    ),
                    manual_confirmation_required=True,
                    evidence={
                        "engine": db.get("engine"),
                        "class": db.get("class"),
                        "multi_az": db.get("multi_az"),
                        "allocated_storage_gib": db.get("allocated_storage_gib"),
                    },
                )
            )

        connections = db.get("metrics", {}).get("db_connections_average_latest")
        if (
            db.get("status") == "available"
            and connections is not None
            and connections <= RDS_NEAR_ZERO_CONNECTIONS
        ):
            findings.append(
                Finding(
                    severity="medium",
                    confidence="medium",
                    resource_type="rds_instance",
                    resource_id=db.get("id") or "unknown-rds",
                    region=db.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "The latest CloudWatch DBConnections average is zero or near zero, "
                        "suggesting the database may be idle."
                    ),
                    safe_next_action=(
                        "Check application connection strings, scheduled jobs, backups, and "
                        "recent query activity before changing the instance."
                    ),
                    manual_confirmation_required=True,
                    evidence={"db_connections_average_latest": connections},
                )
            )
    return findings


def _ecs_findings(inventory: InventoryResult, low_traffic: bool) -> list[Finding]:
    findings: list[Finding] = []
    for service in inventory.ecs_services:
        desired_count = int(service.get("desired_count") or 0)
        if desired_count > 0:
            findings.append(
                Finding(
                    severity="medium",
                    confidence="high",
                    resource_type="ecs_service",
                    resource_id=(
                        service.get("service_arn")
                        or service.get("service")
                        or "unknown-ecs"
                    ),
                    region=service.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "ECS services with desired tasks keep compute capacity running through "
                        "Fargate or backing EC2 capacity."
                    ),
                    safe_next_action=(
                        "Confirm traffic, schedules, and deployment requirements before lowering "
                        "desired count or consolidating services."
                    ),
                    manual_confirmation_required=True,
                    evidence={
                        "cluster": service.get("cluster"),
                        "service": service.get("service"),
                        "desired_count": desired_count,
                        "running_count": service.get("running_count"),
                        "task_definition_cpu": service.get("task_definition_cpu"),
                        "task_definition_memory": service.get("task_definition_memory"),
                    },
                )
            )

        if desired_count > 1 and (low_traffic or _resource_has_dev_signal(service)):
            findings.append(
                Finding(
                    severity="medium",
                    confidence="medium" if low_traffic else "high",
                    resource_type="ecs_service",
                    resource_id=(
                        service.get("service_arn")
                        or service.get("service")
                        or "unknown-ecs"
                    ),
                    region=service.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "Desired count above one in a dev-like or low-traffic account can be "
                        "unnecessary steady-state capacity."
                    ),
                    safe_next_action=(
                        "Confirm high availability needs for this environment, then consider one "
                        "task or scheduled scaling if appropriate."
                    ),
                    manual_confirmation_required=True,
                    evidence={"desired_count": desired_count, "low_traffic_period": low_traffic},
                )
            )
    return findings


def _ecr_findings(inventory: InventoryResult, now: datetime) -> list[Finding]:
    findings: list[Finding] = []
    for repo in inventory.ecr_repositories:
        image_count = int(repo.get("image_count") or 0)
        oldest = _parse_utc(repo.get("oldest_image_pushed_at"))
        old_enough = oldest is not None and (now - oldest).days >= ECR_OLD_IMAGE_DAYS
        if image_count >= ECR_MANY_IMAGES and old_enough:
            findings.append(
                Finding(
                    severity="low",
                    confidence="medium",
                    resource_type="ecr_repository",
                    resource_id=repo.get("arn") or repo.get("name") or "unknown-ecr",
                    region=repo.get("region"),
                    estimated_recurring="yes",
                    why_it_matters=(
                        "This ECR repository has many images and old pushed dates, which can add "
                        "storage cost over time."
                    ),
                    safe_next_action=(
                        "Review deployment rollback needs, then add or tighten an ECR lifecycle "
                        "policy."
                    ),
                    manual_confirmation_required=True,
                    evidence={
                        "image_count": image_count,
                        "oldest_image_pushed_at": repo.get("oldest_image_pushed_at"),
                        "newest_image_pushed_at": repo.get("newest_image_pushed_at"),
                    },
                )
            )
    return findings


def _route53_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    for zone in inventory.route53_zones:
        findings.append(
            Finding(
                severity="low",
                confidence="high",
                resource_type="route53_hosted_zone",
                resource_id=zone.get("id") or zone.get("name") or "unknown-zone",
                estimated_recurring="yes",
                why_it_matters="Route53 hosted zones have small but recurring monthly charges.",
                safe_next_action=(
                    "Confirm the domain still delegates to this zone and that records are in use "
                    "before deleting any hosted zone."
                ),
                manual_confirmation_required=True,
                evidence={"name": zone.get("name"), "private": zone.get("private")},
            )
        )
    return findings


def _duplicate_shape_findings(inventory: InventoryResult) -> list[Finding]:
    findings: list[Finding] = []
    shape_groups = [
        (
            "load_balancer",
            inventory.load_balancers,
            lambda item: item.get("name") or item.get("arn"),
        ),
        (
            "nat_gateway",
            inventory.nat_gateways,
            lambda item: _name_from_tags(item) or item.get("vpc_id"),
        ),
        ("rds_instance", inventory.rds_instances, lambda item: item.get("id") or item.get("arn")),
        ("ecs_service", inventory.ecs_services, lambda item: item.get("cluster")),
    ]
    for resource_type, resources, name_getter in shape_groups:
        groups: dict[str, list[dict[str, Any]]] = {}
        for resource in resources:
            key = _group_key(resource, name_getter(resource))
            if key:
                groups.setdefault(key, []).append(resource)
        for key, grouped_resources in groups.items():
            if len(grouped_resources) < 2:
                continue
            resource_ids = [_resource_identifier(item) for item in grouped_resources]
            findings.append(
                Finding(
                    severity="medium",
                    confidence="medium",
                    resource_type=resource_type,
                    resource_id=key,
                    estimated_recurring="yes",
                    why_it_matters=(
                        f"Multiple {resource_type} resources appear to share the same app or "
                        "environment shape, which may indicate duplicate infrastructure."
                    ),
                    safe_next_action=(
                        "Compare owners, DNS, deployments, and traffic before consolidating any "
                        "duplicated resources."
                    ),
                    manual_confirmation_required=True,
                    evidence={"resource_ids": resource_ids},
                )
            )
    return findings


def _is_low_traffic(cost_summary: CostSummary | None) -> bool:
    if cost_summary is None:
        return False
    return cost_summary.total_unblended <= LOW_TRAFFIC_MONTHLY_GROSS


def _resource_has_dev_signal(resource: dict[str, Any]) -> bool:
    values: list[str] = []
    for key in ("name", "id", "service", "cluster", "vpc_id"):
        if resource.get(key):
            values.append(str(resource[key]))
    tags = resource.get("tags") or {}
    values.extend(str(value) for value in tags.values())
    text = " ".join(values).lower()
    return any(token in text for token in ("dev", "test", "stage", "staging", "sandbox", "nonprod"))


def _group_key(resource: dict[str, Any], name: str | None) -> str | None:
    tags = resource.get("tags") or {}
    app = _first_tag(tags, "App", "Application", "Project", "Service")
    env = _first_tag(tags, "Env", "Environment", "Stage")
    if app:
        return f"{app.lower()}:{(env or 'unknown').lower()}"
    if not name:
        return None
    normalized = _normalize_name(str(name))
    return normalized or None


def _normalize_name(name: str) -> str:
    tokens = re.split(r"[-_/.\s]+", name.lower())
    ignored = {
        "alb",
        "nlb",
        "lb",
        "load",
        "balancer",
        "nat",
        "gw",
        "gateway",
        "rds",
        "db",
        "database",
        "service",
        "svc",
        "ecs",
        "cluster",
        "prod",
        "production",
        "dev",
        "development",
        "stage",
        "staging",
        "test",
        "api",
        "web",
        "app",
    }
    kept = [
        token
        for token in tokens
        if token
        and token not in ignored
        and not token.isdigit()
        and not re.fullmatch(r"[a-f0-9]{6,}", token)
    ]
    return "-".join(kept[:3])


def _first_tag(tags: dict[str, str], *names: str) -> str | None:
    lowered = {key.lower(): value for key, value in tags.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value:
            return value
    return None


def _name_from_tags(resource: dict[str, Any]) -> str | None:
    return _first_tag(resource.get("tags") or {}, "Name")


def _resource_identifier(resource: dict[str, Any]) -> str:
    for key in ("arn", "service_arn", "id", "name", "service", "allocation_id", "public_ip"):
        if resource.get(key):
            return str(resource[key])
    return "unknown"


def _parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _finding_sort_key(finding: Finding) -> tuple[int, int, str]:
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    return (
        severity_order.get(finding.severity, 99),
        confidence_order.get(finding.confidence, 99),
        finding.resource_type,
    )
