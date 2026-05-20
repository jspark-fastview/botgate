# 기존 content-vpc 재사용 (옛 cluster 와 같은 VPC, 다른 subnet).
# 2026-05-19 사고 (2c IP 부족) 의 근본 해결로 b/d 만 사용.

data "aws_vpc" "content" {
  filter {
    name   = "tag:Name"
    values = ["content-vpc"]
  }
}

# AZ b, d — 가장 IP 여유 있는 두 곳 (b: 101 free, d: 138 free @ 2026-05-19).
# 2a 도 가능하지만 옛 cluster (a/c) 와 segregation 위해 의도적으로 회피.
data "aws_subnet" "b" {
  filter {
    name   = "tag:Name"
    values = ["content-b-ec2"]
  }
}

data "aws_subnet" "d" {
  filter {
    name   = "tag:Name"
    values = ["content-d-ec2"]
  }
}

locals {
  vpc_id     = data.aws_vpc.content.id
  subnet_ids = [data.aws_subnet.b.id, data.aws_subnet.d.id]
}

# EKS 서브넷 발견 태그 — ALB Ingress controller 가 subnet 자동 선택.
# tag key 가 cluster name 기반이라 옛 cluster (guardus-eks) 와 충돌 없음.
resource "aws_ec2_tag" "subnet_elb_role_v2" {
  for_each    = toset(local.subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "subnet_cluster_v2" {
  for_each    = toset(local.subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/cluster/${var.cluster_name}"
  value       = "shared"
}

# Karpenter 가 EC2NodeClass.subnetSelectorTerms 로 자동 발견.
# tag value 가 cluster name 기반이라 옛 cluster 의 Karpenter 와 충돌 없음.
resource "aws_ec2_tag" "subnet_karpenter_v2" {
  for_each    = toset(local.subnet_ids)
  resource_id = each.value
  key         = "karpenter.sh/discovery"
  value       = var.cluster_name
}
