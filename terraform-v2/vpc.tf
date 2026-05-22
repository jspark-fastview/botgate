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

# ─────────────────────────────────────────────────────────────────
# VPC secondary CIDR — 2b/2d subnet IP 고갈 대응 (2026-05-22).
# 기존 172.21.0.0/16 의 b (172.21.4.0/24) IP 가 0 가용 → cilium 이 secondary ENI 추가 실패.
# argocd / cert-manager / kps-grafana 등 다수 pod stuck 발생.
#
# 무중단 추가 — 기존 노드 / pod / SG (모두 SG-to-SG) / NACL (default all-allow) 영향 0.
# Karpenter EC2NodeClass.subnetSelectorTerms (태그 기반) 가 자동 발견 → 다음 노드부터 새 subnet 사용.
# EKS cluster subnet / managed node group subnet 변경 X (control plane 영향 / force replacement 회피).
# ALB ingress 의 elb 태그는 의도적 제외 → ALB 자동 확장 차단 (분리 안전).
#
# CIDR 선택 — 100.64.0.0/10 (RFC 6598 carrier-grade NAT).
# AWS 가 secondary CIDR 으로 어떤 VPC primary CIDR 이든 허용하는 예외 범위.
# 기존 VPC 의 RFC1918 범위 (172.16.0.0/12) 와 무관하게 추가 가능.
# 인터넷에 라우팅 안 되는 private 범위 — 보안 동등.
# ─────────────────────────────────────────────────────────────────

resource "aws_vpc_ipv4_cidr_block_association" "ext" {
  vpc_id     = data.aws_vpc.content.id
  cidr_block = "100.64.0.0/16"
}

# 기존 subnet 이 사용 중인 route table 발견 — 새 subnet 도 같은 route table 사용 (IGW 0.0.0.0/0 동일).
data "aws_route_table" "b" {
  subnet_id = data.aws_subnet.b.id
}

data "aws_route_table" "d" {
  subnet_id = data.aws_subnet.d.id
}

# 새 2b subnet — 1019 IPs (5 reserved by AWS).
resource "aws_subnet" "b_ext" {
  vpc_id            = data.aws_vpc.content.id
  cidr_block        = "100.64.0.0/22"
  availability_zone = "ap-northeast-2b"

  tags = {
    Name                                        = "content-b-ec2-ext"
    "karpenter.sh/discovery"                    = var.cluster_name
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  depends_on = [aws_vpc_ipv4_cidr_block_association.ext]
}

# 새 2d subnet — 1019 IPs.
resource "aws_subnet" "d_ext" {
  vpc_id            = data.aws_vpc.content.id
  cidr_block        = "100.64.4.0/22"
  availability_zone = "ap-northeast-2d"

  tags = {
    Name                                        = "content-d-ec2-ext"
    "karpenter.sh/discovery"                    = var.cluster_name
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  depends_on = [aws_vpc_ipv4_cidr_block_association.ext]
}

# 기존 route table 을 새 subnet 에 연결.
resource "aws_route_table_association" "b_ext" {
  subnet_id      = aws_subnet.b_ext.id
  route_table_id = data.aws_route_table.b.id
}

resource "aws_route_table_association" "d_ext" {
  subnet_id      = aws_subnet.d_ext.id
  route_table_id = data.aws_route_table.d.id
}
