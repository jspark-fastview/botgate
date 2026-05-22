# Cilium v2 — 새 cluster (guardus-eks-v2) 용. 옛 cilium.tf 와 거의 동일.
# module.eks_v2 reference + pod_identity_association.cilium_operator depend.

resource "helm_release" "cilium" {
  name             = "cilium"
  repository       = "https://helm.cilium.io"
  chart            = "cilium"
  version          = "1.16.4"
  namespace        = "kube-system"
  create_namespace = false

  wait    = false
  timeout = 600

  values = [yamlencode({
    eni                        = { enabled = true }
    ipam                       = { mode = "eni" }
    routingMode                = "native"
    endpointRoutes             = { enabled = true }
    egressMasqueradeInterfaces = "eth0"

    # ipv4NativeRoutingCIDR 추가 시 cilium 1.16.4 가 invalid iptables 룰 ("! -d 0.0.0.0/0")
    # 생성해서 crashLoop — 100.64.0.0/10 또 0.0.0.0/0 둘 다 같은 버그 (2026-05-22 학습).
    # 새 secondary CIDR pod 의 DNS/S3 timeout 은 별도 옵션 (ipMasqAgent 등) 검토 필요.

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

  depends_on = [
    module.eks_v2,
    aws_eks_pod_identity_association.cilium_operator,
  ]
}
