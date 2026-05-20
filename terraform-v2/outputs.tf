output "cluster_name" {
  value = module.eks_v2.cluster_name
}

output "cluster_endpoint" {
  value = module.eks_v2.cluster_endpoint
}

output "kubeconfig_command" {
  value       = "aws eks update-kubeconfig --name ${module.eks_v2.cluster_name} --region ${var.region} --alias guardus-v2"
  description = "새 cluster kubeconfig context (alias=guardus-v2)"
}

# IAM role ARN — 옛 cluster 와 같은 role 재사용 (data source).
output "role_arns" {
  value = {
    external_secrets  = data.aws_iam_role.external_secrets.arn
    aws_lb_controller = data.aws_iam_role.aws_lb_controller.arn
    admin_api         = data.aws_iam_role.admin_api.arn
    cilium_operator   = data.aws_iam_role.cilium_operator.arn
    ebs_csi           = data.aws_iam_role.ebs_csi.arn
  }
}

output "pod_identity_associations" {
  value = {
    external_secrets  = "${aws_eks_pod_identity_association.external_secrets.namespace}/${aws_eks_pod_identity_association.external_secrets.service_account}"
    aws_lb_controller = "${aws_eks_pod_identity_association.aws_lb_controller.namespace}/${aws_eks_pod_identity_association.aws_lb_controller.service_account}"
    admin_api         = "${aws_eks_pod_identity_association.admin_api.namespace}/${aws_eks_pod_identity_association.admin_api.service_account}"
    cilium_operator   = "${aws_eks_pod_identity_association.cilium_operator.namespace}/${aws_eks_pod_identity_association.cilium_operator.service_account}"
    ebs_csi           = "${aws_eks_pod_identity_association.ebs_csi.namespace}/${aws_eks_pod_identity_association.ebs_csi.service_account}"
  }
}
