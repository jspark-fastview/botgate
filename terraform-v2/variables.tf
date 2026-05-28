variable "region" {
  type    = string
  default = "ap-northeast-2"
}

variable "env" {
  type    = string
  default = "learn"   # dev/prod 분리는 workspace 또는 별도 root 로 추후 확장
}

variable "cluster_name" {
  type    = string
  default = "guardus-eks-v2"
}

variable "k8s_version" {
  type    = string
  # EKS minor 마다 14개월 표준 지원 — 매번 14개월 지나면 또 upgrade.
  # 1.33 표준지원 종료: 2026.07.29 → 1.34 로 업그레이드 (표준지원 ~ 2026.10).
  # 2026-05-28: 1.34 → 1.35. EKS upgrade insight 5/5 통과. deprecated API 사용 X.
  default = "1.35"
}

# VPC/서브넷은 신규 생성 X — 기존 content-vpc 를 data source 로 참조 (vpc.tf)

variable "node_instance_types" {
  type    = list(string)
  # Graviton (arm64). t4g.medium 은 17 pod max — KPS/cert-manager/ESO/argocd 등 깔리면 즉시 한도.
  # t4g.large = 35 pod max, t4g.xlarge = 58. Spot fallback 으로 둘 다 등록.
  default = ["t4g.large", "t4g.xlarge"]
}

variable "node_min_size" {
  type    = number
  # 2026-05-28: spot mngd NG 는 절대 baseline 만 담당 (cluster-essential workload).
  # Burst capacity 는 Karpenter 가 동적 추가 (NodePool limit 100 CPU).
  default = 2
}

variable "node_desired_size" {
  type    = number
  # 2026-05-28: 5 → 2.
  # 이전 정책: mngd NG 가 baseline + burst 둘 다 담당 → desired 크게.
  # 새 정책: mngd NG 는 절대 baseline 만, Karpenter 가 burst.
  # mimir RF=3 host-spread 는 Karpenter 노드도 포함 (3 다른 host 면 OK).
  # 메모리: desired_size 는 terraform 의 ignore_changes — aws cli 로 즉시 조정 필요.
  default = 2
}

variable "node_max_size" {
  type    = number
  # 2026-05-28: 7 → 4. burst 는 Karpenter 가 떠받음.
  default = 4
}

variable "aws_account_id" {
  type    = string
  default = "124052247302"
}

variable "github_org_repo" {
  type        = string
  default     = "jspark-fastview/botgate"
  description = "GitHub Actions OIDC trust 의 sub claim (org/repo)"
}
