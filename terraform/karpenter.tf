# Karpenter — 노드 자동 다양화 + 빠른 provisioning + Spot interruption 대응
#
# 기존 managed node group (spot) 은 유지 → Karpenter 가 추가 노드 provision.
# 검증 후 단계적으로 managed node group 축소 가능.

module "karpenter" {
  source  = "terraform-aws-modules/eks/aws//modules/karpenter"
  version = "~> 20.24"

  cluster_name = module.eks.cluster_name

  # Pod Identity 사용 (IRSA 대신 — 본 클러스터 표준)
  enable_pod_identity             = true
  create_pod_identity_association = true
  # Helm chart 의 namespace / SA 와 일치해야 함 (default 는 kube-system 이라 안 맞음)
  namespace       = "karpenter"
  service_account = "karpenter"

  # Karpenter 가 노드에 부여할 IAM role
  # EKS 표준 worker 권한 + SSM (디버깅용)
  node_iam_role_additional_policies = {
    AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  }

  # Karpenter controller 가 띄울 EC2 인스턴스에 자동 적용할 tag
  # → SQS interruption queue 가 이 tag 로 인스턴스 식별
  tags = {
    Name      = "${var.cluster_name}-karpenter"
    Component = "karpenter"
  }
}

# Karpenter 가 사용할 정보 export — k8s manifest 에서 참조
output "karpenter_node_iam_role_name" {
  value       = module.karpenter.node_iam_role_name
  description = "Karpenter 가 EC2NodeClass 의 role 로 사용"
}

output "karpenter_queue_name" {
  value       = module.karpenter.queue_name
  description = "Spot interruption 알림 SQS queue"
}

output "karpenter_service_account_role_arn" {
  value       = module.karpenter.iam_role_arn
  description = "Karpenter controller pod 가 사용할 IAM role (Pod Identity)"
}
