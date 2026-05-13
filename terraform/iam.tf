# IAM 역할 + EKS Pod Identity 매핑
# Pod Identity: K8s ServiceAccount annotation 에 ARN 박지 않고,
# AWS API 에 (cluster, namespace, sa) → role 매핑을 저장하는 신식 패턴 (2023.11 GA).
# - K8s manifest 깨끗 (annotation 없음)
# - IAM trust policy 단순 (OIDC sub claim 매칭 X, service principal 만)
#
# 대상:
#   1. External Secrets Operator
#   2. AWS Load Balancer Controller
#   3. admin-api (placeholder — 정책 비어둠)
#   4. EBS CSI Driver (eks.tf 의 addon 에서 직접 association)
#
# 별도:
#   5. GitHub Actions → ECR push (GitHub OIDC, Pod Identity 와 무관)

# ── 공통: Pod Identity 용 trust policy ─────────────────────────────
data "aws_iam_policy_document" "pod_identity_trust" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

# ── 1. External Secrets Operator ──────────────────────────────────
resource "aws_iam_role" "external_secrets" {
  name               = "guardus-external-secrets"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
}

resource "aws_iam_policy" "external_secrets_read" {
  name = "guardus-external-secrets-read"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        "secretsmanager:ListSecrets"
      ]
      Resource = "arn:aws:secretsmanager:${var.region}:${var.aws_account_id}:secret:guardus/*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "external_secrets" {
  role       = aws_iam_role.external_secrets.name
  policy_arn = aws_iam_policy.external_secrets_read.arn
}

resource "aws_eks_pod_identity_association" "external_secrets" {
  cluster_name    = module.eks.cluster_name
  namespace       = "external-secrets"
  service_account = "external-secrets"   # helm chart 기본 SA 이름
  role_arn        = aws_iam_role.external_secrets.arn
}

# ── 2. AWS Load Balancer Controller ───────────────────────────────
resource "aws_iam_role" "aws_lb_controller" {
  name               = "guardus-aws-lb-controller"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
}

# AWS 공식 정책 JSON — 변경이 잦아 직접 fetch
data "http" "alb_controller_policy" {
  url = "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.8.2/docs/install/iam_policy.json"
}

resource "aws_iam_policy" "aws_lb_controller" {
  name   = "guardus-aws-lb-controller"
  policy = data.http.alb_controller_policy.response_body
}

resource "aws_iam_role_policy_attachment" "aws_lb_controller" {
  role       = aws_iam_role.aws_lb_controller.name
  policy_arn = aws_iam_policy.aws_lb_controller.arn
}

resource "aws_eks_pod_identity_association" "aws_lb_controller" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.aws_lb_controller.arn
}

# ── 3. admin-api ──────────────────────────────────────────────────
# 현재 정책 비어둠 — 필요해질 때 attachment 추가
resource "aws_iam_role" "admin_api" {
  name               = "guardus-admin-api"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
}

resource "aws_eks_pod_identity_association" "admin_api" {
  cluster_name    = module.eks.cluster_name
  namespace       = "guardus"
  service_account = "admin-api"
  role_arn        = aws_iam_role.admin_api.arn
}

# ── 4. Cilium Operator (ENI 모드 — EC2 API 호출) ───────────────────
resource "aws_iam_role" "cilium_operator" {
  name               = "guardus-cilium-operator"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
}

# ENI 모드에서 필요한 EC2 권한 — Cilium 공식 문서 기준 최소 집합
resource "aws_iam_policy" "cilium_operator" {
  name = "guardus-cilium-operator"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceTypes",
        "ec2:DescribeTags",
        "ec2:CreateNetworkInterface",
        "ec2:DeleteNetworkInterface",
        "ec2:AttachNetworkInterface",
        "ec2:DetachNetworkInterface",
        "ec2:ModifyNetworkInterfaceAttribute",
        "ec2:CreateTags",
        "ec2:AssignPrivateIpAddresses",
        "ec2:UnassignPrivateIpAddresses",
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cilium_operator" {
  role       = aws_iam_role.cilium_operator.name
  policy_arn = aws_iam_policy.cilium_operator.arn
}

resource "aws_eks_pod_identity_association" "cilium_operator" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "cilium-operator"
  role_arn        = aws_iam_role.cilium_operator.arn
}

# ── 5. EBS CSI ────────────────────────────────────────────────────
# addon 의 service_account_role_arn 대신 pod_identity_association 사용 (eks.tf 참조)
resource "aws_iam_role" "ebs_csi" {
  name               = "guardus-ebs-csi"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_trust.json
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_pod_identity_association" "ebs_csi" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "ebs-csi-controller-sa"
  role_arn        = aws_iam_role.ebs_csi.arn
}

# ── 6. GitHub Actions → ECR push (GitHub OIDC — Pod Identity 와 무관) ─
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_ecr_push" {
  name = "github-actions-ecr-push"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_org_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name = "ecr-push"
  role = aws_iam_role.github_ecr_push.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = [for r in aws_ecr_repository.this : r.arn]
      }
    ]
  })
}
