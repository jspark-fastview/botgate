# 2026-05-28: VPC Endpoints — Karpenter 노드의 secondary ENI primary CIDR pod 가
# 외부 AWS API 도달 못 하는 문제 근본 해결.
#
# 문제:
#   mngd 노드의 보조 ENI = secondary CIDR (100.64.x.x) — Cilium 이 host primary IP 로 SNAT
#   Karpenter 노드의 보조 ENI = primary CIDR (172.21.x.x) — SNAT 안 됨 → 인터넷 차단
#   → mimir/ebs-csi/ALB controller 외부 API timeout
#
# 해결:
#   AWS API 들을 VPC 내부 endpoint 로. 모든 노드/pod 가 VPC routing 통해 도달 (public 인터넷 우회).
#
# 비용 (월):
#   S3 = Gateway endpoint, 무료
#   Interface endpoints × 5 (ec2, ecr.api, ecr.dkr, sts, elasticloadbalancing)
#     × 2 AZ × $0.01/h × 730h = ~$73/월
#
# 추가 안정성: 인터넷 outage / IGW 문제 시에도 AWS API 도달 (production 권장 패턴)

# Endpoint dedicated SG — VPC 내부 모든 traffic 허용 (HTTPS 443)
resource "aws_security_group" "endpoint" {
  name        = "guardus-eks-v2-vpc-endpoints"
  description = "VPC interface endpoints inbound from cluster (HTTPS)"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTPS from VPC (primary + secondary CIDR)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["172.21.0.0/16", "100.64.0.0/16"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name      = "guardus-eks-v2-vpc-endpoints"
    Component = "vpc-endpoint"
  }
}

# Gateway endpoint — S3 (무료, route table 매칭만)
# mimir-prod 의 metric storage / loki chunk storage 가 사용
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = local.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"

  # 모든 subnet 의 route table 에 endpoint route 추가
  route_table_ids = [
    data.aws_route_table.b.id,
    data.aws_route_table.d.id,
  ]

  tags = {
    Name      = "guardus-eks-v2-s3-gateway"
    Component = "vpc-endpoint"
  }
}

# Interface endpoint 공통 설정
locals {
  interface_endpoints = {
    ec2                   = "com.amazonaws.${var.region}.ec2"
    ecr_api               = "com.amazonaws.${var.region}.ecr.api"
    ecr_dkr               = "com.amazonaws.${var.region}.ecr.dkr"
    sts                   = "com.amazonaws.${var.region}.sts"
    elasticloadbalancing  = "com.amazonaws.${var.region}.elasticloadbalancing"
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id              = local.vpc_id
  service_name        = each.value
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.subnet_ids
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = true   # *.amazonaws.com 자동 resolve

  tags = {
    Name      = "guardus-eks-v2-${each.key}"
    Component = "vpc-endpoint"
  }
}
