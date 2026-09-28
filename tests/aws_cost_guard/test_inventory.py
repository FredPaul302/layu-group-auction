from __future__ import annotations

from datetime import UTC, datetime

import boto3
from botocore.stub import Stubber

from aws_cost_guard.inventory import collect_ec2_instances, collect_route53_zones


def test_collect_ec2_instances_uses_read_only_describe_call() -> None:
    ec2 = boto3.Session(
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    ).client("ec2", region_name="us-east-1")
    stubber = Stubber(ec2)
    stubber.add_response(
        "describe_instances",
        {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": "i-0123456789abcdef0",
                            "State": {"Name": "running"},
                            "InstanceType": "t3.micro",
                            "LaunchTime": datetime(2026, 6, 1, tzinfo=UTC),
                            "Tags": [{"Key": "Name", "Value": "auction-dev-web"}],
                            "PublicIpAddress": "203.0.113.10",
                            "PrivateIpAddress": "10.0.1.10",
                            "VpcId": "vpc-123",
                            "SubnetId": "subnet-123",
                        }
                    ]
                }
            ]
        },
        {},
    )

    errors: list[dict[str, str]] = []
    with stubber:
        instances = collect_ec2_instances(ec2, "us-east-1", errors)

    assert errors == []
    assert instances == [
        {
            "region": "us-east-1",
            "id": "i-0123456789abcdef0",
            "state": "running",
            "type": "t3.micro",
            "launch_time": "2026-06-01T00:00:00Z",
            "tags": {"Name": "auction-dev-web"},
            "public_ip": "203.0.113.10",
            "private_ip": "10.0.1.10",
            "vpc_id": "vpc-123",
            "subnet_id": "subnet-123",
        }
    ]


def test_collect_ec2_instances_records_permission_errors_and_continues() -> None:
    ec2 = boto3.Session(
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    ).client("ec2", region_name="us-east-1")
    stubber = Stubber(ec2)
    stubber.add_client_error(
        "describe_instances",
        service_error_code="UnauthorizedOperation",
        service_message="not allowed",
        http_status_code=403,
    )

    errors: list[dict[str, str]] = []
    with stubber:
        instances = collect_ec2_instances(ec2, "us-east-1", errors)

    assert instances == []
    assert errors[0]["service"] == "ec2"
    assert errors[0]["code"] == "UnauthorizedOperation"


def test_collect_route53_zones_marks_private_and_public_zones() -> None:
    route53 = boto3.Session(
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
    ).client("route53", region_name="us-east-1")
    stubber = Stubber(route53)
    stubber.add_response(
        "list_hosted_zones",
        {
            "HostedZones": [
                {
                    "Id": "/hostedzone/ZPUBLIC",
                    "Name": "example.com.",
                    "CallerReference": "public",
                    "Config": {"PrivateZone": False},
                    "ResourceRecordSetCount": 4,
                },
                {
                    "Id": "/hostedzone/ZPRIVATE",
                    "Name": "internal.example.com.",
                    "CallerReference": "private",
                    "Config": {"PrivateZone": True},
                    "ResourceRecordSetCount": 2,
                },
            ],
            "IsTruncated": False,
            "Marker": "",
            "MaxItems": "100",
        },
        {},
    )

    errors: list[dict[str, str]] = []
    with stubber:
        zones = collect_route53_zones(route53, errors)

    assert errors == []
    assert zones == [
        {
            "id": "ZPUBLIC",
            "name": "example.com.",
            "private": False,
            "resource_record_set_count": 4,
        },
        {
            "id": "ZPRIVATE",
            "name": "internal.example.com.",
            "private": True,
            "resource_record_set_count": 2,
        },
    ]
