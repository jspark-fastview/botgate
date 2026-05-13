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
  default = "guardus-eks"
}

variable "k8s_version" {
  type    = string
  default = "1.31"
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
  default = 1
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
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
