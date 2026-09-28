from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from aws_cost_guard.cost_explorer import fetch_cost_and_usage
from aws_cost_guard.inventory import collect_inventory
from aws_cost_guard.report import write_reports
from aws_cost_guard.rules import evaluate_inventory

BUDGET_NAME = "aws-cost-guard-monthly-cost"


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "audit":
        return run_audit(args)
    if args.command == "budget":
        return run_budget(args)
    parser.print_help()
    return 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aws-cost-guard",
        description="Read-only AWS cost audit and budget guardrail CLI.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit", help="Collect read-only cost and inventory report.")
    audit.add_argument(
        "--profile",
        help="AWS profile name. Falls back to AWS SDK credential chain.",
    )
    audit.add_argument(
        "--start",
        required=True,
        type=_parse_date,
        help="Inclusive start date YYYY-MM-DD.",
    )
    audit.add_argument(
        "--end",
        required=True,
        type=_parse_date,
        help="Inclusive end date YYYY-MM-DD.",
    )
    audit.add_argument(
        "--regions",
        help="Comma-separated AWS regions. Defaults to enabled region discovery.",
    )
    audit.add_argument("--out", default="report.md", help="Markdown report path.")
    audit.add_argument("--json", default="report.json", help="JSON report path.")
    audit.add_argument("--verbose", action="store_true", help="Print collection progress.")

    budget = subparsers.add_parser("budget", help="Dry-run or apply an AWS Budgets alert.")
    budget.add_argument(
        "--profile",
        help="AWS profile name. Falls back to AWS SDK credential chain.",
    )
    budget.add_argument(
        "--amount",
        required=True,
        type=_parse_decimal,
        help="Monthly USD threshold.",
    )
    budget.add_argument("--email", required=True, help="Alert email address.")
    budget_mode = budget.add_mutually_exclusive_group()
    budget_mode.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Preview only. This is the default unless --apply is provided.",
    )
    budget_mode.add_argument(
        "--apply",
        action="store_true",
        help="Create or update the AWS Budget. Required for any mutation API call.",
    )

    return parser


def run_audit(args: argparse.Namespace) -> int:
    if args.start > args.end:
        raise SystemExit("--start must be on or before --end")

    warnings = root_credential_warnings()
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    session = _make_session(args.profile)
    regions = _parse_regions(args.regions)
    progress = (lambda message: print(message, file=sys.stderr)) if args.verbose else None

    cost_summary = fetch_cost_and_usage(session, args.start, args.end)
    inventory = collect_inventory(session, regions=regions, progress=progress)
    if inventory.account_arn and inventory.account_arn.endswith(":root"):
        warning = (
            "The active AWS caller identity is the account root user. Continue read-only, "
            "then move routine audits to an IAM Identity Center or least-privilege role."
        )
        warnings.append(warning)
        print(f"warning: {warning}", file=sys.stderr)

    findings = evaluate_inventory(inventory, cost_summary)
    write_reports(
        cost_summary=cost_summary,
        inventory=inventory,
        findings=findings,
        markdown_path=args.out,
        json_path=args.json,
        warnings=warnings,
    )

    print(f"Wrote Markdown report: {args.out}")
    print(f"Wrote JSON report: {args.json}")
    print(f"Findings: {len(findings)}")
    if cost_summary.errors or inventory.errors:
        error_count = len(cost_summary.errors) + len(inventory.errors)
        print(
            f"Completed with {error_count} collection errors; see report.",
            file=sys.stderr,
        )
    return 0


def run_budget(args: argparse.Namespace) -> int:
    if args.amount <= Decimal("0"):
        raise SystemExit("--amount must be greater than zero")

    if not args.apply:
        print("Dry run: no AWS Budgets mutation APIs will be called.")
        print(f"Budget name: {BUDGET_NAME}")
        print(f"Monthly threshold: ${args.amount.quantize(Decimal('0.01'))}")
        print(f"Alert email: {args.email}")
        print("Re-run with --apply to create or update the budget alert.")
        return 0

    warnings = root_credential_warnings()
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    session = _make_session(args.profile)
    result = apply_budget(session, amount=args.amount, email=args.email)
    print(result)
    return 0


def apply_budget(session: Any, *, amount: Decimal, email: str) -> str:
    sts = session.client("sts", region_name="us-east-1")
    budgets = session.client("budgets", region_name="us-east-1")
    account_id = sts.get_caller_identity()["Account"]
    budget = _budget_payload(amount)
    notification = _budget_notification(amount)
    subscriber = {"SubscriptionType": "EMAIL", "Address": email}

    try:
        budgets.describe_budget(AccountId=account_id, BudgetName=BUDGET_NAME)
        budgets.update_budget(AccountId=account_id, NewBudget=budget)
        _ensure_budget_notification(budgets, account_id, notification, subscriber)
        return f"Updated AWS Budget {BUDGET_NAME} for account {account_id}."
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code not in {"NotFoundException", "ResourceNotFoundException"}:
            raise

    budgets.create_budget(
        AccountId=account_id,
        Budget=budget,
        NotificationsWithSubscribers=[
            {"Notification": notification, "Subscribers": [subscriber]},
        ],
    )
    return f"Created AWS Budget {BUDGET_NAME} for account {account_id}."


def root_credential_warnings() -> list[str]:
    warnings: list[str] = []
    if (
        os.environ.get("AWS_ACCESS_KEY_ID")
        and os.environ.get("AWS_SECRET_ACCESS_KEY")
        and not os.environ.get("AWS_SESSION_TOKEN")
    ):
        warnings.append(
            "Long-lived AWS environment credentials are set without AWS_SESSION_TOKEN. "
            "If these are root or IAM user keys, prefer AWS SSO or a short-lived role."
        )
    return warnings


def _ensure_budget_notification(
    budgets: Any,
    account_id: str,
    notification: dict[str, Any],
    subscriber: dict[str, str],
) -> None:
    existing = budgets.describe_notifications_for_budget(
        AccountId=account_id,
        BudgetName=BUDGET_NAME,
    ).get("Notifications", [])
    if not existing:
        budgets.create_notification(
            AccountId=account_id,
            BudgetName=BUDGET_NAME,
            Notification=notification,
            Subscribers=[subscriber],
        )
        return

    old_notification = existing[0]
    budgets.update_notification(
        AccountId=account_id,
        BudgetName=BUDGET_NAME,
        OldNotification=old_notification,
        NewNotification=notification,
    )

    subscribers = budgets.describe_subscribers_for_notification(
        AccountId=account_id,
        BudgetName=BUDGET_NAME,
        Notification=notification,
    ).get("Subscribers", [])
    if subscriber not in subscribers:
        try:
            budgets.create_subscriber(
                AccountId=account_id,
                BudgetName=BUDGET_NAME,
                Notification=notification,
                Subscriber=subscriber,
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "DuplicateRecordException":
                raise


def _budget_payload(amount: Decimal) -> dict[str, Any]:
    return {
        "BudgetName": BUDGET_NAME,
        "BudgetLimit": {"Amount": str(amount), "Unit": "USD"},
        "TimeUnit": "MONTHLY",
        "BudgetType": "COST",
        "CostTypes": {
            "IncludeTax": True,
            "IncludeSubscription": True,
            "UseBlended": False,
            "IncludeRefund": True,
            "IncludeCredit": True,
            "IncludeUpfront": True,
            "IncludeRecurring": True,
            "IncludeOtherSubscription": True,
            "IncludeSupport": True,
            "IncludeDiscount": True,
            "UseAmortized": False,
        },
    }


def _budget_notification(amount: Decimal) -> dict[str, Any]:
    return {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": float(amount),
        "ThresholdType": "ABSOLUTE_VALUE",
    }


def _make_session(profile: str | None) -> Any:
    try:
        import boto3
    except ImportError as exc:
        raise SystemExit(
            "boto3 is required. Install with: python -m pip install aws-cost-guard"
        ) from exc

    try:
        if profile:
            return boto3.Session(profile_name=profile)
        return boto3.Session()
    except (BotoCoreError, ClientError) as exc:
        raise SystemExit(f"Unable to create AWS session: {exc}") from exc


def _parse_regions(value: str | None) -> list[str] | None:
    if value is None:
        return None
    regions = [region.strip() for region in value.split(",") if region.strip()]
    return regions or None


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from exc


def _parse_decimal(value: str) -> Decimal:
    try:
        return Decimal(value)
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError("expected a decimal USD amount") from exc


if __name__ == "__main__":
    raise SystemExit(main())
