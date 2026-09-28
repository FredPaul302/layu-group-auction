from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from aws_cost_guard.cost_explorer import CostLine, CostSummary
from aws_cost_guard.inventory import InventoryResult
from aws_cost_guard.rules import Finding


def write_reports(
    *,
    cost_summary: CostSummary,
    inventory: InventoryResult,
    findings: list[Finding],
    markdown_path: str | Path,
    json_path: str | Path,
    warnings: list[str] | None = None,
) -> None:
    warnings = warnings or []
    generated_at = datetime.now(UTC)
    markdown = render_markdown_report(
        cost_summary=cost_summary,
        inventory=inventory,
        findings=findings,
        generated_at=generated_at,
        warnings=warnings,
    )
    json_report = render_json_report(
        cost_summary=cost_summary,
        inventory=inventory,
        findings=findings,
        generated_at=generated_at,
        warnings=warnings,
    )

    markdown_file = Path(markdown_path)
    json_file = Path(json_path)
    markdown_file.parent.mkdir(parents=True, exist_ok=True)
    json_file.parent.mkdir(parents=True, exist_ok=True)
    markdown_file.write_text(markdown, encoding="utf-8")
    json_file.write_text(json.dumps(json_report, indent=2, sort_keys=True), encoding="utf-8")


def render_json_report(
    *,
    cost_summary: CostSummary,
    inventory: InventoryResult,
    findings: list[Finding],
    generated_at: datetime,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "tool": "aws-cost-guard",
        "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
        "warnings": warnings,
        "costs": cost_summary.to_dict(),
        "inventory": inventory.to_dict(),
        "findings": [finding.to_dict() for finding in findings],
        "summary": {
            "finding_count": len(findings),
            "findings_by_severity": dict(Counter(finding.severity for finding in findings)),
            "inventory_counts": _inventory_counts(inventory),
        },
    }


def render_markdown_report(
    *,
    cost_summary: CostSummary,
    inventory: InventoryResult,
    findings: list[Finding],
    generated_at: datetime,
    warnings: list[str],
) -> str:
    cost_period = (
        f"{cost_summary.start_date.isoformat()} to "
        f"{cost_summary.end_date.isoformat()} (inclusive)"
    )
    net_total = (
        _money(cost_summary.total_net_unblended)
        if cost_summary.total_net_unblended is not None
        else "unavailable"
    )
    lines: list[str] = [
        "# AWS Cost Guard Report",
        "",
        f"- Generated: {generated_at.isoformat().replace('+00:00', 'Z')}",
        f"- Account: {inventory.account_id or 'unknown'}",
        f"- Caller ARN: {inventory.account_arn or 'unknown'}",
        f"- Cost period: {cost_period}",
        f"- Regions audited: {', '.join(inventory.regions) if inventory.regions else 'none'}",
        "",
        "## Security Warnings",
        "",
    ]

    if warnings:
        lines.extend(f"- {warning}" for warning in warnings)
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Cost Explorer Summary",
            "",
            f"- UnblendedCost: {_money(cost_summary.total_unblended)}",
            f"- NetUnblendedCost: {net_total}",
            f"- Estimated period: {'yes' if cost_summary.estimated else 'no'}",
            "",
            "Top service and usage-type lines:",
            "",
            "| Service | Usage type | Unblended | Net unblended |",
            "| --- | --- | ---: | ---: |",
        ]
    )

    for cost_line in cost_summary.lines[:25]:
        lines.append(_cost_line_row(cost_line))
    if not cost_summary.lines:
        lines.append("| No Cost Explorer data returned |  |  |  |")

    lines.extend(
        [
            "",
            "Top service totals:",
            "",
            "| Service | Unblended | Net unblended |",
            "| --- | ---: | ---: |",
        ]
    )
    for service, totals in _service_totals(cost_summary).items():
        lines.append(
            f"| {_escape(service)} | {_money(totals['unblended'])} | "
            f"{_money(totals['net']) if totals['net'] is not None else 'unavailable'} |"
        )

    lines.extend(
        [
            "",
            "## Inventory Summary",
            "",
            "| Resource class | Count |",
            "| --- | ---: |",
        ]
    )
    for name, count in _inventory_counts(inventory).items():
        lines.append(f"| {name} | {count} |")

    lines.extend(
        [
            "",
            "## Findings",
            "",
            "Each finding is advisory. The audit command is read-only and does not "
            "stop, delete, resize, or modify resources.",
            "",
            "| Severity | Confidence | Resource | Region | Recurring | Why it matters | "
            "Safe next action | Manual confirmation |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for finding in findings:
        lines.append(_finding_row(finding))
    if not findings:
        lines.append(
            "| info | high | none |  | unknown | No findings generated. | "
            "Re-run after confirming permissions and regions. | no |"
        )

    errors = list(cost_summary.errors) + list(inventory.errors)
    lines.extend(
        [
            "",
            "## Permission And Collection Errors",
            "",
        ]
    )
    if errors:
        lines.extend(
            [
                "| Service | Region | Operation | Code | Message |",
                "| --- | --- | --- | --- | --- |",
            ]
        )
        for error in errors:
            lines.append(
                "| {service} | {region} | {operation} | {code} | {message} |".format(
                    service=_escape(str(error.get("service", ""))),
                    region=_escape(str(error.get("region", ""))),
                    operation=_escape(str(error.get("operation", ""))),
                    code=_escape(str(error.get("code", ""))),
                    message=_escape(str(error.get("message", ""))),
                )
            )
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Savings are not claimed as exact unless they come directly from Cost Explorer data.",
            "- Cost Explorer data is grouped by SERVICE and USAGE_TYPE using "
            "UnblendedCost and NetUnblendedCost when available.",
            "- Some resources are global or regionless; Route53 hosted zones are listed once.",
            "",
        ]
    )
    return "\n".join(lines)


def _cost_line_row(cost_line: CostLine) -> str:
    net = (
        _money(cost_line.net_unblended_cost)
        if cost_line.net_unblended_cost is not None
        else "unavailable"
    )
    return (
        f"| {_escape(cost_line.service)} | {_escape(cost_line.usage_type)} | "
        f"{_money(cost_line.unblended_cost)} | {net} |"
    )


def _finding_row(finding: Finding) -> str:
    return (
        f"| {finding.severity} | {finding.confidence} | "
        f"{_escape(finding.resource_type + ': ' + finding.resource_id)} | "
        f"{_escape(finding.region or '')} | {finding.estimated_recurring} | "
        f"{_escape(finding.why_it_matters)} | {_escape(finding.safe_next_action)} | "
        f"{'yes' if finding.manual_confirmation_required else 'no'} |"
    )


def _service_totals(cost_summary: CostSummary) -> dict[str, dict[str, Decimal | None]]:
    totals: defaultdict[str, dict[str, Decimal | None]] = defaultdict(
        lambda: {"unblended": Decimal("0"), "net": None}
    )
    for line in cost_summary.lines:
        totals[line.service]["unblended"] = (
            (totals[line.service]["unblended"] or Decimal("0")) + line.unblended_cost
        )
        if line.net_unblended_cost is not None:
            totals[line.service]["net"] = (
                (totals[line.service]["net"] or Decimal("0")) + line.net_unblended_cost
            )
    return dict(
        sorted(
            totals.items(),
            key=lambda item: item[1]["unblended"] or Decimal("0"),
            reverse=True,
        )
    )


def _inventory_counts(inventory: InventoryResult) -> dict[str, int]:
    return {
        "EC2 instances": len(inventory.ec2_instances),
        "Unattached EBS volumes": len(inventory.ebs_volumes),
        "Elastic IPs": len(inventory.elastic_ips),
        "NAT gateways": len(inventory.nat_gateways),
        "Load balancers": len(inventory.load_balancers),
        "RDS instances": len(inventory.rds_instances),
        "ECS services": len(inventory.ecs_services),
        "ECR repositories": len(inventory.ecr_repositories),
        "Route53 hosted zones": len(inventory.route53_zones),
    }


def _money(value: Decimal | None) -> str:
    if value is None:
        return "unavailable"
    return f"${value.quantize(Decimal('0.01'))}"


def _escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")
