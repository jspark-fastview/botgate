output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "ecr_urls" {
  value = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

# Pod Identity 매핑된 IAM role ARN 들.
# K8s manifest 에 박을 필요 없음 — AWS 쪽 매핑이 자동 인증해줌.
# 참고용 (디버깅 / 콘솔 확인 시).
output "role_arns" {
  value = {
    external_secrets   = aws_iam_role.external_secrets.arn
    aws_lb_controller  = aws_iam_role.aws_lb_controller.arn
    admin_api          = aws_iam_role.admin_api.arn
    cilium_operator    = aws_iam_role.cilium_operator.arn
    ebs_csi            = aws_iam_role.ebs_csi.arn
    github_actions_ecr = aws_iam_role.github_ecr_push.arn
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

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region}"
}

output "rds" {
  value = {
    endpoint    = aws_db_instance.main.address
    port        = aws_db_instance.main.port
    db_name     = aws_db_instance.main.db_name
    secret_id   = aws_secretsmanager_secret.rds_master.name
    jdbc_url    = "jdbc:postgresql://${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  }
}

# 비번 자체는 sensitive — `terraform output -raw rds_password` 로만
output "rds_password" {
  value     = random_password.rds_master.result
  sensitive = true
}
