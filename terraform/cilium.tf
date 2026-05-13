# Cilium — CNI + kube-proxy 대체 + Hubble observability
#
# 왜 Terraform 인가:
#   부트스트랩 크리티컬 — 노드가 Ready 되려면 CNI 필요. ArgoCD 가 깔리기 전에 동작해야.
#   따라서 클러스터 + 노드그룹과 한 묶음으로 Terraform 이 직접 설치.
#
# 부트스트랩 순서:
#   1. EKS control plane up (10분)
#   2. 노드그룹 ASG 가 노드 시작 — vpc-cni 없으니 NotReady 상태
#   3. helm_release.cilium 이 cilium chart 설치
#   4. Cilium DaemonSet 가 NotReady 노드에 스케줄 (toleration 기본)
#   5. cilium-agent 가 datapath 구성 → 노드 Ready
#   6. CoreDNS / Pod-Identity-Agent / EBS-CSI 가 정상 스케줄
#
# IPAM 모드: ENI — pod 가 VPC 의 진짜 secondary IP 받음 (overlay X)
# kubeProxyReplacement: true — kube-proxy 완전 제거, eBPF 가 service routing
# routingMode: native — VXLAN encapsulation X, VPC route table 직접 사용

resource "helm_release" "cilium" {
  name             = "cilium"
  repository       = "https://helm.cilium.io"
  chart            = "cilium"
  version          = "1.16.4"
  namespace        = "kube-system"
  create_namespace = false

  # 노드 부팅 대기 안 함 — DaemonSet 는 노드가 생긴 후 알아서 스케줄
  wait    = false
  timeout = 600

  values = [yamlencode({
    # ── ENI 모드: pod 가 VPC 진짜 IP ─────────────────────────────
    eni                        = { enabled = true }
    ipam                       = { mode = "eni" }
    routingMode                = "native"
    endpointRoutes             = { enabled = true }
    egressMasqueradeInterfaces = "eth0"

    # ── kube-proxy 완전 대체 ────────────────────────────────────
    kubeProxyReplacement = true
    k8sServiceHost       = replace(module.eks.cluster_endpoint, "https://", "")
    k8sServicePort       = 443

    # ── operator: Pod Identity 로 EC2 API 호출 ──────────────────
    operator = {
      replicas   = 1                       # 학습용 — prod 면 2
      prometheus = { enabled = true }
      # SA 는 chart 가 만들고 (annotation 없음), Pod Identity 매핑은 iam.tf
    }

    # ── Hubble (L7 observability) ───────────────────────────────
    hubble = {
      enabled = true
      relay   = { enabled = true }
      ui      = { enabled = true }
      metrics = {
        # ServiceMonitor 는 kube-prometheus-stack 깔린 뒤 enable
        # 지금은 metric endpoint 만 노출
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

    # ── 메인 agent 모니터링 ─────────────────────────────────────
    prometheus = { enabled = true }
  })]

  depends_on = [
    module.eks,
    # operator 가 EC2 호출하려면 Pod Identity 매핑이 먼저 ready
    aws_eks_pod_identity_association.cilium_operator,
  ]
}
