from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

import boto3
from botocore.stub import Stubber

from aws_cost_guard.cost_explorer import fetch_cost_and_usage


class StaticSession:
    def __init__(self, client: Any) -> None:
        self._client = client

    def client(self, service: str, region_name: str | None = None) -> Any:
        assert service == "ce"
        assert region_name == "us-east-1"
        return self._client


def test_fetch_cost_and_usage_groups_by_service_and_usage_type() -> None:
    ce = boto3.Session(
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    ).client("ce", region_name="us-east-1")
    stubber = Stubber(ce)
    stubber.add_response(
        "get_cost_and_usage",
        {
            "ResultsByTime": [
                {
                    "TimePeriod": {"Start": "2026-06-01", "End": "2026-07-01"},
                    "Estimated": False,
                    "Groups": [
                        {
                            "Keys": ["Elastic Load Balancing", "LoadBalancerUsage"],
                            "Metrics": {
                                "UnblendedCost": {"Amount": "16.21", "Unit": "USD"},
                                "NetUnblendedCost": {"Amount": "16.21", "Unit": "USD"},
                            },
                        },
                        {
                            "Keys": ["Amazon VPC", "NatGateway-Hours"],
                            "Metrics": {
                                "UnblendedCost": {"Amount": "28.83", "Unit": "USD"},
                                "NetUnblendedCost": {"Amount": "13.40", "Unit": "USD"},
                            },
                        },
                    ],
                    "Total": {},
                }
            ],
            "ResponseMetadata": {"HTTPStatusCode": 200},
        },
        {
            "TimePeriod": {"Start": "2026-06-01", "End": "2026-07-01"},
            "Granularity": "MONTHLY",
            "Metrics": ["UnblendedCost", "NetUnblendedCost"],
            "GroupBy": [
                {"Type": "DIMENSION", "Key": "SERVICE"},
                {"Type": "DIMENSION", "Key": "USAGE_TYPE"},
            ],
        },
    )

    with stubber:
        summary = fetch_cost_and_usage(StaticSession(ce), date(2026, 6, 1), date(2026, 6, 30))

    assert summary.total_unblended == Decimal("45.04")
    assert summary.total_net_unblended == Decimal("29.61")
    assert summary.lines[0].service == "Amazon VPC"
    assert summary.end_date == date(2026, 6, 30)
