from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

Progress = Callable[[str], None]


@dataclass(slots=True)
class InventoryResult:
    account_id: str | None = None
    account_arn: str | None = None
    regions: list[str] = field(default_factory=list)
    ec2_instances: list[dict[str, Any]] = field(default_factory=list)
    ebs_volumes: list[dict[str, Any]] = field(default_factory=list)
    elastic_ips: list[dict[str, Any]] = field(default_factory=list)
    nat_gateways: list[dict[str, Any]] = field(default_factory=list)
    load_balancers: list[dict[str, Any]] = field(default_factory=list)
    rds_instances: list[dict[str, Any]] = field(default_factory=list)
    ecs_services: list[dict[str, Any]] = field(default_factory=list)
    ecr_repositories: list[dict[str, Any]] = field(default_factory=list)
    route53_zones: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "account_id": self.account_id,
            "account_arn": self.account_arn,
            "regions": self.regions,
            "ec2_instances": self.ec2_instances,
            "ebs_volumes": self.ebs_volumes,
            "elastic_ips": self.elastic_ips,
            "nat_gateways": self.nat_gateways,
            "load_balancers": self.load_balancers,
            "rds_instances": self.rds_instances,
            "ecs_services": self.ecs_services,
            "ecr_repositories": self.ecr_repositories,
            "route53_zones": self.route53_zones,
            "errors": self.errors,
        }


def discover_enabled_regions(session: Any) -> tuple[list[str], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    ec2 = session.client("ec2", region_name="us-east-1")
    try:
        response = ec2.describe_regions(AllRegions=True)
    except (ClientError, BotoCoreError) as exc:
        errors.append(_error_to_dict("ec2", "us-east-1", "DescribeRegions", exc))
        fallback = session.region_name or "us-east-1"
        return [fallback], errors

    regions = [
        region["RegionName"]
        for region in response.get("Regions", [])
        if region.get("OptInStatus") in {None, "opt-in-not-required", "opted-in"}
    ]
    return sorted(regions), errors


def collect_inventory(
    session: Any,
    regions: list[str] | None = None,
    progress: Progress | None = None,
) -> InventoryResult:
    errors: list[dict[str, Any]] = []
    account_id, account_arn = collect_identity(session, errors)

    if regions is None:
        regions, region_errors = discover_enabled_regions(session)
        errors.extend(region_errors)

    inventory = InventoryResult(
        account_id=account_id,
        account_arn=account_arn,
        regions=regions,
        errors=errors,
    )

    _emit(progress, "Collecting Route53 hosted zones")
    route53 = session.client("route53", region_name="us-east-1")
    inventory.route53_zones.extend(collect_route53_zones(route53, errors))

    for region in regions:
        _emit(progress, f"Collecting regional inventory in {region}")
        ec2 = session.client("ec2", region_name=region)
        inventory.ec2_instances.extend(collect_ec2_instances(ec2, region, errors))
        inventory.ebs_volumes.extend(collect_ebs_volumes(ec2, region, errors))
        inventory.elastic_ips.extend(collect_elastic_ips(ec2, region, errors))
        inventory.nat_gateways.extend(collect_nat_gateways(ec2, region, errors))

        elbv2 = session.client("elbv2", region_name=region)
        cloudwatch = session.client("cloudwatch", region_name=region)
        inventory.load_balancers.extend(collect_load_balancers(elbv2, cloudwatch, region, errors))

        rds = session.client("rds", region_name=region)
        inventory.rds_instances.extend(collect_rds_instances(rds, cloudwatch, region, errors))

        ecs = session.client("ecs", region_name=region)
        inventory.ecs_services.extend(collect_ecs_services(ecs, region, errors))

        ecr = session.client("ecr", region_name=region)
        inventory.ecr_repositories.extend(collect_ecr_repositories(ecr, region, errors))

    return inventory


def collect_identity(session: Any, errors: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    sts = session.client("sts", region_name="us-east-1")
    response = _safe_call(sts, "sts", "global", "GetCallerIdentity", errors)
    if not response:
        return None, None
    return response.get("Account"), response.get("Arn")


def collect_ec2_instances(
    ec2: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    instances: list[dict[str, Any]] = []
    for page in _safe_pages(ec2, "ec2", region, "DescribeInstances", errors):
        for reservation in page.get("Reservations", []):
            for instance in reservation.get("Instances", []):
                instances.append(
                    {
                        "region": region,
                        "id": instance.get("InstanceId"),
                        "state": instance.get("State", {}).get("Name"),
                        "type": instance.get("InstanceType"),
                        "launch_time": _iso(instance.get("LaunchTime")),
                        "tags": _tags_to_dict(instance.get("Tags", [])),
                        "public_ip": instance.get("PublicIpAddress"),
                        "private_ip": instance.get("PrivateIpAddress"),
                        "vpc_id": instance.get("VpcId"),
                        "subnet_id": instance.get("SubnetId"),
                    }
                )
    return instances


def collect_ebs_volumes(
    ec2: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    volumes: list[dict[str, Any]] = []
    filters = [{"Name": "status", "Values": ["available"]}]
    for page in _safe_pages(ec2, "ec2", region, "DescribeVolumes", errors, Filters=filters):
        for volume in page.get("Volumes", []):
            volumes.append(
                {
                    "region": region,
                    "id": volume.get("VolumeId"),
                    "size_gib": volume.get("Size"),
                    "volume_type": volume.get("VolumeType"),
                    "created_at": _iso(volume.get("CreateTime")),
                    "availability_zone": volume.get("AvailabilityZone"),
                    "tags": _tags_to_dict(volume.get("Tags", [])),
                }
            )
    return volumes


def collect_elastic_ips(
    ec2: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    response = _safe_call(ec2, "ec2", region, "DescribeAddresses", errors)
    addresses: list[dict[str, Any]] = []
    for address in response.get("Addresses", []) if response else []:
        addresses.append(
            {
                "region": region,
                "allocation_id": address.get("AllocationId"),
                "association_id": address.get("AssociationId"),
                "public_ip": address.get("PublicIp"),
                "domain": address.get("Domain"),
                "instance_id": address.get("InstanceId"),
                "network_interface_id": address.get("NetworkInterfaceId"),
                "tags": _tags_to_dict(address.get("Tags", [])),
            }
        )
    return addresses


def collect_nat_gateways(
    ec2: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    gateways: list[dict[str, Any]] = []
    for page in _safe_pages(ec2, "ec2", region, "DescribeNatGateways", errors):
        for gateway in page.get("NatGateways", []):
            gateways.append(
                {
                    "region": region,
                    "id": gateway.get("NatGatewayId"),
                    "state": gateway.get("State"),
                    "vpc_id": gateway.get("VpcId"),
                    "subnet_id": gateway.get("SubnetId"),
                    "created_at": _iso(gateway.get("CreateTime")),
                    "addresses": gateway.get("NatGatewayAddresses", []),
                    "tags": _tags_to_dict(gateway.get("Tags", [])),
                }
            )
    return gateways


def collect_load_balancers(
    elbv2: Any, cloudwatch: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    load_balancers: list[dict[str, Any]] = []
    for page in _safe_pages(elbv2, "elbv2", region, "DescribeLoadBalancers", errors):
        for lb in page.get("LoadBalancers", []):
            arn = lb.get("LoadBalancerArn")
            tag_response = (
                _safe_call(
                    elbv2,
                    "elbv2",
                    region,
                    "DescribeTags",
                    errors,
                    ResourceArns=[arn],
                )
                if arn
                else None
            )
            tag_descriptions = tag_response.get("TagDescriptions", []) if tag_response else []
            tags = (
                _tags_to_dict(tag_descriptions[0].get("Tags", []))
                if tag_descriptions
                else {}
            )
            listeners = _collect_elbv2_children(
                elbv2, "DescribeListeners", "Listeners", errors, region, LoadBalancerArn=arn
            )
            target_groups = _collect_elbv2_children(
                elbv2, "DescribeTargetGroups", "TargetGroups", errors, region, LoadBalancerArn=arn
            )
            metrics = {"request_count_7d": None, "request_count_30d": None}
            if lb.get("Type") == "application" and arn:
                dimensions = [{"Name": "LoadBalancer", "Value": _load_balancer_metric_value(arn)}]
                metrics["request_count_7d"] = cloudwatch_sum_metric(
                    cloudwatch,
                    region,
                    errors,
                    namespace="AWS/ApplicationELB",
                    metric_name="RequestCount",
                    dimensions=dimensions,
                    days=7,
                )
                metrics["request_count_30d"] = cloudwatch_sum_metric(
                    cloudwatch,
                    region,
                    errors,
                    namespace="AWS/ApplicationELB",
                    metric_name="RequestCount",
                    dimensions=dimensions,
                    days=30,
                )

            load_balancers.append(
                {
                    "region": region,
                    "arn": arn,
                    "name": lb.get("LoadBalancerName"),
                    "type": lb.get("Type"),
                    "scheme": lb.get("Scheme"),
                    "vpc_id": lb.get("VpcId"),
                    "dns_name": lb.get("DNSName"),
                    "state": lb.get("State", {}).get("Code"),
                    "created_at": _iso(lb.get("CreatedTime")),
                    "tags": tags,
                    "listeners": [
                        {
                            "arn": listener.get("ListenerArn"),
                            "port": listener.get("Port"),
                            "protocol": listener.get("Protocol"),
                        }
                        for listener in listeners
                    ],
                    "target_groups": [
                        {
                            "arn": target_group.get("TargetGroupArn"),
                            "name": target_group.get("TargetGroupName"),
                            "protocol": target_group.get("Protocol"),
                            "port": target_group.get("Port"),
                            "target_type": target_group.get("TargetType"),
                        }
                        for target_group in target_groups
                    ],
                    "metrics": metrics,
                }
            )
    return load_balancers


def collect_rds_instances(
    rds: Any, cloudwatch: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    instances: list[dict[str, Any]] = []
    for page in _safe_pages(rds, "rds", region, "DescribeDBInstances", errors):
        for db in page.get("DBInstances", []):
            identifier = db.get("DBInstanceIdentifier")
            arn = db.get("DBInstanceArn")
            tags: dict[str, str] = {}
            if arn:
                tag_response = _safe_call(
                    rds,
                    "rds",
                    region,
                    "ListTagsForResource",
                    errors,
                    ResourceName=arn,
                )
                tags = _tags_to_dict(tag_response.get("TagList", [])) if tag_response else {}

            dimensions = [{"Name": "DBInstanceIdentifier", "Value": identifier}]
            instances.append(
                {
                    "region": region,
                    "id": identifier,
                    "arn": arn,
                    "engine": db.get("Engine"),
                    "class": db.get("DBInstanceClass"),
                    "status": db.get("DBInstanceStatus"),
                    "allocated_storage_gib": db.get("AllocatedStorage"),
                    "multi_az": db.get("MultiAZ"),
                    "publicly_accessible": db.get("PubliclyAccessible"),
                    "backup_retention_days": db.get("BackupRetentionPeriod"),
                    "created_at": _iso(db.get("InstanceCreateTime")),
                    "tags": tags,
                    "metrics": {
                        "cpu_average_latest": cloudwatch_latest_average_metric(
                            cloudwatch,
                            region,
                            errors,
                            namespace="AWS/RDS",
                            metric_name="CPUUtilization",
                            dimensions=dimensions,
                        ),
                        "db_connections_average_latest": cloudwatch_latest_average_metric(
                            cloudwatch,
                            region,
                            errors,
                            namespace="AWS/RDS",
                            metric_name="DatabaseConnections",
                            dimensions=dimensions,
                        ),
                    },
                }
            )
    return instances


def collect_ecs_services(
    ecs: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    services: list[dict[str, Any]] = []
    cluster_arns: list[str] = []
    for page in _safe_pages(ecs, "ecs", region, "ListClusters", errors):
        cluster_arns.extend(page.get("clusterArns", []))

    for cluster_arn in cluster_arns:
        service_arns: list[str] = []
        for page in _safe_pages(
            ecs, "ecs", region, "ListServices", errors, cluster=cluster_arn
        ):
            service_arns.extend(page.get("serviceArns", []))

        for chunk in _chunks(service_arns, 10):
            response = _safe_call(
                ecs,
                "ecs",
                region,
                "DescribeServices",
                errors,
                cluster=cluster_arn,
                services=chunk,
            )
            for service in response.get("services", []) if response else []:
                task_definition = service.get("taskDefinition")
                task_cpu = None
                task_memory = None
                if task_definition:
                    task_response = _safe_call(
                        ecs,
                        "ecs",
                        region,
                        "DescribeTaskDefinition",
                        errors,
                        taskDefinition=task_definition,
                    )
                    task_data = task_response.get("taskDefinition", {}) if task_response else {}
                    task_cpu = task_data.get("cpu")
                    task_memory = task_data.get("memory")

                services.append(
                    {
                        "region": region,
                        "cluster": _arn_name(cluster_arn),
                        "cluster_arn": cluster_arn,
                        "service": service.get("serviceName"),
                        "service_arn": service.get("serviceArn"),
                        "status": service.get("status"),
                        "desired_count": service.get("desiredCount", 0),
                        "running_count": service.get("runningCount", 0),
                        "launch_type": service.get("launchType"),
                        "capacity_providers": [
                            item.get("capacityProvider")
                            for item in service.get("capacityProviderStrategy", [])
                            if item.get("capacityProvider")
                        ],
                        "task_definition": task_definition,
                        "task_definition_cpu": task_cpu,
                        "task_definition_memory": task_memory,
                        "load_balancers": service.get("loadBalancers", []),
                        "created_at": _iso(service.get("createdAt")),
                    }
                )
    return services


def collect_ecr_repositories(
    ecr: Any, region: str, errors: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    repositories: list[dict[str, Any]] = []
    for page in _safe_pages(ecr, "ecr", region, "DescribeRepositories", errors):
        for repo in page.get("repositories", []):
            name = repo.get("repositoryName")
            pushed_dates: list[datetime] = []
            image_count = 0
            for image_page in _safe_pages(
                ecr, "ecr", region, "DescribeImages", errors, repositoryName=name
            ):
                for image in image_page.get("imageDetails", []):
                    image_count += 1
                    pushed_at = image.get("imagePushedAt")
                    if isinstance(pushed_at, datetime):
                        pushed_dates.append(pushed_at)
            repositories.append(
                {
                    "region": region,
                    "name": name,
                    "arn": repo.get("repositoryArn"),
                    "image_count": image_count,
                    "oldest_image_pushed_at": _iso(min(pushed_dates)) if pushed_dates else None,
                    "newest_image_pushed_at": _iso(max(pushed_dates)) if pushed_dates else None,
                }
            )
    return repositories


def collect_route53_zones(route53: Any, errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    zones: list[dict[str, Any]] = []
    for page in _safe_pages(route53, "route53", "global", "ListHostedZones", errors):
        for zone in page.get("HostedZones", []):
            zones.append(
                {
                    "id": str(zone.get("Id", "")).removeprefix("/hostedzone/"),
                    "name": zone.get("Name"),
                    "private": zone.get("Config", {}).get("PrivateZone", False),
                    "resource_record_set_count": zone.get("ResourceRecordSetCount"),
                }
            )
    return zones


def cloudwatch_sum_metric(
    cloudwatch: Any,
    region: str,
    errors: list[dict[str, Any]],
    *,
    namespace: str,
    metric_name: str,
    dimensions: list[dict[str, str]],
    days: int,
) -> float | None:
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    response = _safe_call(
        cloudwatch,
        "cloudwatch",
        region,
        "GetMetricStatistics",
        errors,
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=dimensions,
        StartTime=start,
        EndTime=end,
        Period=86400,
        Statistics=["Sum"],
    )
    if response is None:
        return None
    return float(sum(point.get("Sum", 0) for point in response.get("Datapoints", [])))


def cloudwatch_latest_average_metric(
    cloudwatch: Any,
    region: str,
    errors: list[dict[str, Any]],
    *,
    namespace: str,
    metric_name: str,
    dimensions: list[dict[str, str]],
) -> float | None:
    end = datetime.now(UTC)
    start = end - timedelta(hours=6)
    response = _safe_call(
        cloudwatch,
        "cloudwatch",
        region,
        "GetMetricStatistics",
        errors,
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=dimensions,
        StartTime=start,
        EndTime=end,
        Period=300,
        Statistics=["Average"],
    )
    if response is None:
        return None
    datapoints = response.get("Datapoints", [])
    if not datapoints:
        return 0.0
    latest = max(
        datapoints,
        key=lambda point: point.get("Timestamp", datetime.min.replace(tzinfo=UTC)),
    )
    return float(latest.get("Average", 0))


def _collect_elbv2_children(
    elbv2: Any,
    operation: str,
    result_key: str,
    errors: list[dict[str, Any]],
    region: str,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    children: list[dict[str, Any]] = []
    for page in _safe_pages(elbv2, "elbv2", region, operation, errors, **kwargs):
        children.extend(page.get(result_key, []))
    return children


def _safe_call(
    client: Any,
    service: str,
    region: str,
    operation: str,
    errors: list[dict[str, Any]],
    **kwargs: Any,
) -> dict[str, Any] | None:
    try:
        method = getattr(client, _snake_case(operation))
        return method(**kwargs)
    except (ClientError, BotoCoreError) as exc:
        errors.append(_error_to_dict(service, region, operation, exc))
        return None


def _safe_pages(
    client: Any,
    service: str,
    region: str,
    operation: str,
    errors: list[dict[str, Any]],
    **kwargs: Any,
) -> Iterable[dict[str, Any]]:
    try:
        paginator = client.get_paginator(_snake_case(operation))
        yield from paginator.paginate(**kwargs)
    except (ClientError, BotoCoreError) as exc:
        errors.append(_error_to_dict(service, region, operation, exc))


def _error_to_dict(
    service: str, region: str, operation: str, exc: Exception
) -> dict[str, Any]:
    code = exc.__class__.__name__
    message = str(exc)
    if isinstance(exc, ClientError):
        code = str(exc.response.get("Error", {}).get("Code", code))
        message = str(exc.response.get("Error", {}).get("Message", message))
    return {
        "service": service,
        "region": region,
        "operation": operation,
        "code": code,
        "message": message,
    }


def _tags_to_dict(tags: list[dict[str, Any]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for tag in tags:
        key = tag.get("Key") or tag.get("key")
        value = tag.get("Value") or tag.get("value") or ""
        if key:
            result[str(key)] = str(value)
    return result


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
    return str(value)


def _load_balancer_metric_value(arn: str) -> str:
    marker = "loadbalancer/"
    return arn.split(marker, 1)[1] if marker in arn else arn


def _snake_case(operation: str) -> str:
    first_pass = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", operation)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", first_pass).lower()


def _arn_name(arn: str) -> str:
    return arn.rsplit("/", 1)[-1]


def _chunks(values: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _emit(progress: Progress | None, message: str) -> None:
    if progress:
        progress(message)
