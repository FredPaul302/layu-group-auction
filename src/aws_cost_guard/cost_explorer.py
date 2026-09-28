from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError


@dataclass(slots=True)
class CostLine:
    service: str
    usage_type: str
    unblended_cost: Decimal
    net_unblended_cost: Decimal | None
    unit: str = "USD"

    def to_dict(self) -> dict[str, Any]:
        return {
            "service": self.service,
            "usage_type": self.usage_type,
            "unblended_cost": str(self.unblended_cost),
            "net_unblended_cost": str(self.net_unblended_cost)
            if self.net_unblended_cost is not None
            else None,
            "unit": self.unit,
        }


@dataclass(slots=True)
class CostSummary:
    start_date: date
    end_date: date
    lines: list[CostLine] = field(default_factory=list)
    total_unblended: Decimal = Decimal("0")
    total_net_unblended: Decimal | None = None
    estimated: bool = False
    errors: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "total_unblended": str(self.total_unblended),
            "total_net_unblended": str(self.total_net_unblended)
            if self.total_net_unblended is not None
            else None,
            "estimated": self.estimated,
            "lines": [line.to_dict() for line in self.lines],
            "errors": self.errors,
        }


def fetch_cost_and_usage(session: Any, start_date: date, end_date: date) -> CostSummary:
    """Fetch one Cost Explorer report grouped by service and usage type.

    The CLI accepts an inclusive end date. Cost Explorer expects an exclusive end date,
    so this function adds one day when building the API request.
    """

    client = session.client("ce", region_name="us-east-1")
    metrics = ["UnblendedCost", "NetUnblendedCost"]
    try:
        return _fetch_cost_and_usage(client, start_date, end_date, metrics)
    except ClientError as exc:
        if _is_metric_validation_error(exc):
            summary = _fetch_cost_and_usage(client, start_date, end_date, ["UnblendedCost"])
            summary.errors.append(
                {
                    "service": "ce",
                    "operation": "GetCostAndUsage",
                    "code": _client_error_code(exc),
                    "message": "NetUnblendedCost was unavailable; retried with UnblendedCost only.",
                }
            )
            return summary
        return CostSummary(
            start_date=start_date,
            end_date=end_date,
            errors=[_error_to_dict("ce", "GetCostAndUsage", exc)],
        )
    except BotoCoreError as exc:
        return CostSummary(
            start_date=start_date,
            end_date=end_date,
            errors=[_error_to_dict("ce", "GetCostAndUsage", exc)],
        )


def _fetch_cost_and_usage(
    client: Any, start_date: date, end_date: date, metrics: list[str]
) -> CostSummary:
    end_exclusive = end_date + timedelta(days=1)
    request: dict[str, Any] = {
        "TimePeriod": {
            "Start": start_date.isoformat(),
            "End": end_exclusive.isoformat(),
        },
        "Granularity": "MONTHLY",
        "Metrics": metrics,
        "GroupBy": [
            {"Type": "DIMENSION", "Key": "SERVICE"},
            {"Type": "DIMENSION", "Key": "USAGE_TYPE"},
        ],
    }

    grouped: dict[tuple[str, str], CostLine] = {}
    estimated = False
    next_token: str | None = None

    while True:
        page_request = dict(request)
        if next_token:
            page_request["NextPageToken"] = next_token

        response = client.get_cost_and_usage(**page_request)
        for result in response.get("ResultsByTime", []):
            estimated = estimated or bool(result.get("Estimated", False))
            for group in result.get("Groups", []):
                keys = list(group.get("Keys", []))
                service = keys[0] if keys else "Unknown"
                usage_type = keys[1] if len(keys) > 1 else "Unknown"
                metric_values = group.get("Metrics", {})
                unblended = _metric_amount(metric_values, "UnblendedCost")
                net_unblended = (
                    _metric_amount(metric_values, "NetUnblendedCost")
                    if "NetUnblendedCost" in metric_values
                    else None
                )
                unit = metric_values.get("UnblendedCost", {}).get("Unit", "USD")
                key = (service, usage_type)
                if key not in grouped:
                    grouped[key] = CostLine(
                        service=service,
                        usage_type=usage_type,
                        unblended_cost=unblended,
                        net_unblended_cost=net_unblended,
                        unit=unit,
                    )
                    continue

                existing = grouped[key]
                existing.unblended_cost += unblended
                if net_unblended is not None:
                    existing.net_unblended_cost = (
                        (existing.net_unblended_cost or Decimal("0")) + net_unblended
                    )

        next_token = response.get("NextPageToken")
        if not next_token:
            break

    lines = sorted(grouped.values(), key=lambda line: line.unblended_cost, reverse=True)
    total_unblended = sum((line.unblended_cost for line in lines), Decimal("0"))
    net_values = [line.net_unblended_cost for line in lines if line.net_unblended_cost is not None]
    total_net = sum(net_values, Decimal("0")) if net_values else None
    return CostSummary(
        start_date=start_date,
        end_date=end_date,
        lines=lines,
        total_unblended=total_unblended,
        total_net_unblended=total_net,
        estimated=estimated,
    )


def _metric_amount(metrics: dict[str, Any], name: str) -> Decimal:
    amount = metrics.get(name, {}).get("Amount", "0")
    return Decimal(str(amount))


def _is_metric_validation_error(exc: ClientError) -> bool:
    code = _client_error_code(exc)
    message = exc.response.get("Error", {}).get("Message", "")
    return (
        code in {"ValidationException", "InvalidParameterException"}
        and "NetUnblendedCost" in message
    )


def _client_error_code(exc: ClientError) -> str:
    return str(exc.response.get("Error", {}).get("Code", exc.__class__.__name__))


def _error_to_dict(service: str, operation: str, exc: Exception) -> dict[str, Any]:
    code = exc.__class__.__name__
    message = str(exc)
    if isinstance(exc, ClientError):
        code = _client_error_code(exc)
        message = str(exc.response.get("Error", {}).get("Message", message))
    return {
        "service": service,
        "operation": operation,
        "code": code,
        "message": message,
    }
