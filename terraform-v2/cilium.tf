# Cilium v2 — 새 cluster (guardus-eks-v2) 용. 옛 cilium.tf 와 거의 동일.
# module.eks_v2 reference + pod_identity_association.cilium_operator depend.

resource "helm_release" "cilium" {
  name             = "cilium"
  repository       = "https://helm.cilium.io"
  chart            = "cilium"
  # 2026-05-28: 1.16.4 → 1.16.19. leftover routing rule cleanup 버그 fix.
  # helm CLI 로 cluster state 변경 됐음 (revision 10). terraform code 동기화.
  version          = "1.16.19"
  namespace        = "kube-system"
  create_namespace = false

  wait    = false
  timeout = 600

  # 2026-05-28: values 도 helm get 으로 추출한 user-supplied 와 일치하도록 정리.
  # k8s/platform/cilium/values.yaml 와 같은 내용. helm CLI / ArgoCD 가 같은 release 관리.
  # terraform apply 시 drift 없도록 동일하게 명시.
  values = [yamlencode({
    eni                        = { enabled = true }
    ipam                       = { mode = "eni" }
    routingMode                = "native"
    endpointRoutes             = { enabled = true }
    egressMasqueradeInterfaces = "eth0"

    # 1.16.4 의 ipv4NativeRoutingCIDR 버그 (invalid iptables 룰 "! -d 0.0.0.0/0") 는 1.16.19 에서 fix.
    # 단 ENI mode 의 secondary ENI 가 primary CIDR subnet 에 attach 되는 케이스의 SNAT 이슈는 별 도.
    # 2026-05-28 학습: VPC interface endpoints 추가 + critical pod 의 nodeAffinity 로 우회.

    kubeProxyReplacement = true
    k8sServiceHost       = replace(module.eks_v2.cluster_endpoint, "https://", "")
    k8sServicePort       = 443

    operator = {
      replicas   = 1
      prometheus = { enabled = true }
    }

    hubble = {
      enabled = true
      relay   = { enabled = true }
      ui      = { enabled = true }
      metrics = {
        serviceMonitor = { enabled = false }
        enabled = [
          "dns:query;ignoreAAAA",
          "drop",
          "tcp",
          "flow",
          "icmp",
          "http",
        ]
      }
    }

    prometheus = { enabled = true }
  })]

  # helm CLI / ArgoCD 가 같은 release 관리 — version 외엔 drift 무시
  # (수동 변경 후 terraform apply 시 revert 방지)
  lifecycle {
    ignore_changes = [values]
  }

  depends_on = [
    module.eks_v2,
    aws_eks_pod_identity_association.cilium_operator,
  ]
}
