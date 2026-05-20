# Karpenter v2 — 새 cluster (guardus-eks-v2) 용.
# module "karpenter_v2" — 옛 module "karpenter" 와 분리. 새 IAM role + 새 SQS queue.

module "karpenter_v2" {
  source  = "terraform-aws-modules/eks/aws//modules/karpenter"
  version = "~> 20.24"

  cluster_name = module.eks_v2.cluster_name

  enable_pod_identity             = true
  create_pod_identity_association = true
  namespace       = "karpenter"
  service_account = "karpenter"

  node_iam_role_additional_policies = {
    AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  }

  tags = {
    Name      = "${var.cluster_name}-karpenter"
    Component = "karpenter"
  }
}

# Karpenter 가 사용할 정보 export
output "karpenter_node_iam_role_name" {
  value       = module.karpenter_v2.node_iam_role_name
  description = "Karpenter 가 EC2NodeClass 의 role 로 사용 (k8s/platform/karpenter/ec2nodeclass.yaml 의 role 필드)"
}

output "karpenter_queue_name" {
  value       = module.karpenter_v2.queue_name
  description = "Spot interruption SQS queue (helm values 의 settings.interruptionQueue)"
}

output "karpenter_service_account_role_arn" {
  value       = module.karpenter_v2.iam_role_arn
  description = "Karpenter controller pod 의 IAM role (Pod Identity)"
}
