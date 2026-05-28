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

# Gateway endpoint — S3:
# 이미 존재 (vpce-09729949a3b4ea478, content VPC 전체 route table 에 attached).
# terraform 외부 관리 — resource 명시 X.

# Interface endpoints — service 별 지원 AZ 가 다름.
# ec2 / elasticloadbalancing: 4 AZ 다 지원 → b + d
# ecr.api / ecr.dkr / sts: a/b/c 만 (d 미지원) → b 만
locals {
  interface_endpoints = {
    # b + d 둘 다 가능
    ec2 = {
      service = "com.amazonaws.${var.region}.ec2"
      subnets = local.subnet_ids
    }
    elasticloadbalancing = {
      service = "com.amazonaws.${var.region}.elasticloadbalancing"
      subnets = local.subnet_ids
    }
    # AZ d 미지원 → b 만. AZ d 노드는 cross-AZ 로 b 의 endpoint 도달 (latency 약간 ↑, 비용 무시).
    ecr_api = {
      service = "com.amazonaws.${var.region}.ecr.api"
      subnets = [data.aws_subnet.b.id]
    }
    ecr_dkr = {
      service = "com.amazonaws.${var.region}.ecr.dkr"
      subnets = [data.aws_subnet.b.id]
    }
    sts = {
      service = "com.amazonaws.${var.region}.sts"
      subnets = [data.aws_subnet.b.id]
    }
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id              = local.vpc_id
  service_name        = each.value.service
  vpc_endpoint_type   = "Interface"
  subnet_ids          = each.value.subnets
  security_group_ids  = [aws_security_group.endpoint.id]
  private_dns_enabled = true   # *.amazonaws.com 자동 resolve

  tags = {
    Name      = "guardus-eks-v2-${each.key}"
    Component = "vpc-endpoint"
  }
}
