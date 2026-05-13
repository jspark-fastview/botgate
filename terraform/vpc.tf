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

locals {
  vpc_id     = data.aws_vpc.content.id
  subnet_ids = [data.aws_subnet.a.id, data.aws_subnet.c.id]
}

# EKS 서브넷 발견 태그 — ALB Ingress controller 가 subnet 을 자동 선택할 때 사용
# 기존 EC2 워크로드에는 영향 없음 (tag 추가만)
resource "aws_ec2_tag" "subnet_elb_role" {
  for_each    = toset(local.subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "subnet_cluster" {
  for_each    = toset(local.subnet_ids)
  resource_id = each.value
  key         = "kubernetes.io/cluster/${var.cluster_name}"
  value       = "shared"
}
