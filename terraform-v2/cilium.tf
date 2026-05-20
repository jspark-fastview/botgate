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
