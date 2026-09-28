from __future__ import annotations

from decimal import Decimal
from typing import Any

import boto3
import pytest
from botocore.stub import Stubber

from aws_cost_guard import cli


def test_budget_dry_run_does_not_create_aws_session(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def fail_session(profile: str | None) -> Any:
        raise AssertionError(f"session should not be created for dry-run: {profile}")

    monkeypatch.setattr(cli, "_make_session", fail_session)

    exit_code = cli.main(["budget", "--amount", "75", "--email", "alerts@example.com"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Dry run" in captured.out
    assert "alerts@example.com" in captured.out


class StaticBudgetSession:
    def __init__(self, sts: Any, budgets: Any) -> None:
        self.sts = sts
        self.budgets = budgets

    def client(self, service: str, region_name: str | None = None) -> Any:
        assert region_name == "us-east-1"
        if service == "sts":
            return self.sts
        if service == "budgets":
            return self.budgets
        raise AssertionError(service)


def test_apply_budget_creates_budget_when_missing() -> None:
    boto_session = boto3.Session(
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    )
    sts = boto_session.client("sts", region_name="us-east-1")
    budgets = boto_session.client("budgets", region_name="us-east-1")
    sts_stubber = Stubber(sts)
    budgets_stubber = Stubber(budgets)

    sts_stubber.add_response(
        "get_caller_identity",
        {
            "UserId": "AIDAEXAMPLE",
            "Account": "123456789012",
            "Arn": "arn:aws:iam::123456789012:role/Audit",
        },
        {},
    )
    budgets_stubber.add_client_error(
        "describe_budget",
        service_error_code="NotFoundException",
        service_message="not found",
        http_status_code=404,
        expected_params={
            "AccountId": "123456789012",
            "BudgetName": cli.BUDGET_NAME,
        },
    )
    budgets_stubber.add_response(
        "create_budget",
        {},
        {
            "AccountId": "123456789012",
            "Budget": cli._budget_payload(Decimal("75")),
            "NotificationsWithSubscribers": [
                {
                    "Notification": cli._budget_notification(Decimal("75")),
                    "Subscribers": [
                        {"SubscriptionType": "EMAIL", "Address": "alerts@example.com"}
                    ],
                }
            ],
        },
    )

    with sts_stubber, budgets_stubber:
        result = cli.apply_budget(
            StaticBudgetSession(sts, budgets),
            amount=Decimal("75"),
            email="alerts@example.com",
        )

    assert result == "Created AWS Budget aws-cost-guard-monthly-cost for account 123456789012."
