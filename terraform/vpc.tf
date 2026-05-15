# 기존 content-vpc 재사용 (신규 VPC 생성 X)
# 같은 VPC 에 EC2 기존 워크로드 + EKS 클러스터 공존
#
# 전제: 모든 서브넷이 IGW 로 0.0.0.0/0 라우팅됨 (= public routing). 확인된 사실.
# 단, MapPublicIpOnLaunch=False 라 EKS 노드는 launch template 에서
# associate_public_ip_address=true 로 강제해야 외부 (ECR/Secrets Manager) 접근 가능.

data "aws_vpc" "content" {
  filter {
    name   = "tag:Name"
    values = ["content-vpc"]
  }
}

# AZ a, c 사용 — EKS 최소 2 AZ
data "aws_subnet" "a" {
  filter {
    name   = "tag:Name"
    values = ["content-a-ec2"]
  }
}

data "aws_subnet" "c" {
  filter {
    name   = "tag:Name"
    values = ["content-c-ec2"]
  }
}

# AZ b, d 도 EKS / Karpenter 용으로 추가 (2c IP 고갈 대응)
# RDS / ElastiCache 는 기존 subnet_ids (a,c) 그대로 사용
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
  # 기존: RDS / ElastiCache subnet group 호환 (a,c 만)
  subnet_ids = [data.aws_subnet.a.id, data.aws_subnet.c.id]
  # 신규: EKS control plane + worker node + Karpenter 가 쓸 subnet (4 AZ)
  eks_subnet_ids = [
    data.aws_subnet.a.id,
    data.aws_subnet.b.id,
    data.aws_subnet.c.id,
    data.aws_subnet.d.id,
  ]
}

# EKS 서브넷 발견 태그 — ALB Ingress controller 가 subnet 을 자동 선택할 때 사용
# 4 AZ 전체에 적용 (Karpenter 가 띄울 노드 / Ingress 가 만들 ALB 둘 다)
resource "aws_ec2_tag" "subnet_elb_role" {
  for_each    = toset(local.eks_subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "subnet_cluster" {
  for_each    = toset(local.eks_subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/cluster/${var.cluster_name}"
  value       = "shared"
}

# Karpenter 가 EC2NodeClass.subnetSelectorTerms 로 자동 발견할 태그
# 4 AZ 모두에 적용 → Karpenter 가 IP 여유 있는 AZ 골라서 노드 띄움
resource "aws_ec2_tag" "subnet_karpenter" {
  for_each    = toset(local.eks_subnet_ids)
  resource_id = each.value
  key         = "karpenter.sh/discovery"
  value       = var.cluster_name
}
