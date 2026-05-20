# IAM — 옛 terraform/iam.tf 의 role 들 재사용 (cluster-independent).
# Pod Identity association 만 새 cluster (guardus-eks-v2) 에 새로 만듬.
# ECR repository / GitHub OIDC role 도 옛 거 그대로 (terraform/ 에서 관리).

# ── 옛 cluster 의 IAM role 들 data source ─────────────────────────
data "aws_iam_role" "external_secrets" { name = "guardus-external-secrets" }
data "aws_iam_role" "aws_lb_controller" { name = "guardus-aws-lb-controller" }
data "aws_iam_role" "admin_api"         { name = "guardus-admin-api" }
data "aws_iam_role" "cilium_operator"   { name = "guardus-cilium-operator" }
data "aws_iam_role" "ebs_csi"           { name = "guardus-ebs-csi" }

# ── 새 cluster 용 Pod Identity associations ───────────────────────
resource "aws_eks_pod_identity_association" "external_secrets" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "external-secrets"
  service_account = "external-secrets"
  role_arn        = data.aws_iam_role.external_secrets.arn
}

resource "aws_eks_pod_identity_association" "aws_lb_controller" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = data.aws_iam_role.aws_lb_controller.arn
}

resource "aws_eks_pod_identity_association" "admin_api" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "guardus"
  service_account = "admin-api"
  role_arn        = data.aws_iam_role.admin_api.arn
}

resource "aws_eks_pod_identity_association" "cilium_operator" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "kube-system"
  service_account = "cilium-operator"
  role_arn        = data.aws_iam_role.cilium_operator.arn
}

resource "aws_eks_pod_identity_association" "ebs_csi" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "kube-system"
  service_account = "ebs-csi-controller-sa"
  role_arn        = data.aws_iam_role.ebs_csi.arn
}

# (Phase 4/5 동안 옛 RDS/Redis SG ingress rule 추가했던 블록 제거됨.
# Phase 6 cluster destroy 와 함께 옛 Redis SG 사라짐 → data source 도 무효.
# 새 RDS/Redis 는 각자 rds_dev.tf, elasticache.tf, elasticache-dev.tf 에서 관리.)
