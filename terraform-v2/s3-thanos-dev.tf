# Thanos dev 전용 — guardus-dev namespace metric 만 S3 장기 보관.
# prod monitoring (monitoring ns + KPS) 와 완전 분리.
# 검증 후 prod 에도 같은 패턴 도입 예정.

# ── S3 bucket (dev 전용) ───────────────────────────────────────────
resource "aws_s3_bucket" "thanos_dev" {
  bucket = "guardus-thanos-metrics-dev"

  tags = {
    Name      = "guardus-thanos-metrics-dev"
    Component = "thanos"
    Env       = "dev"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "thanos_dev" {
  bucket = aws_s3_bucket.thanos_dev.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "thanos_dev" {
  bucket = aws_s3_bucket.thanos_dev.id
  versioning_configuration {
    status = "Disabled"
  }
}

# Retention: raw 30d / 5m downsample 90d / 1h downsample 365d.
# S3 lifecycle 은 395d 후 보조 정리 (compactor 가 자체 retention 우선 처리).
resource "aws_s3_bucket_lifecycle_configuration" "thanos_dev" {
  bucket = aws_s3_bucket.thanos_dev.id

  rule {
    id     = "expire-old-blocks"
    status = "Enabled"
    filter {}
    expiration { days = 395 }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "thanos_dev" {
  bucket                  = aws_s3_bucket.thanos_dev.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role (Pod Identity, dev 전용) ─────────────────────────────
resource "aws_iam_role" "thanos_dev" {
  name               = "guardus-thanos-dev"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_thanos_dev.json
  tags = {
    Component = "thanos"
    Env       = "dev"
  }
}

data "aws_iam_policy_document" "pod_identity_thanos_dev" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

resource "aws_iam_policy" "thanos_dev_s3" {
  name = "guardus-thanos-dev-s3"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.thanos_dev.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.thanos_dev.arn}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "thanos_dev_s3" {
  role       = aws_iam_role.thanos_dev.name
  policy_arn = aws_iam_policy.thanos_dev_s3.arn
}

# ── EKS Pod Identity (monitoring-dev namespace SA) ────────────────
# SA 이름은 helm chart 설치 시 결정. 일반적 이름 (bitnami/thanos 기본) 으로 미리 잡음.
# Prometheus 의 SA — kube-prometheus-stack dev release 시 'prometheus-kps-dev-prometheus' 가능.
# 정확한 이름은 Phase 2 (kps dev release 추가) 에서 확정.
resource "aws_eks_pod_identity_association" "thanos_dev_sidecar" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring-dev"
  service_account = "prometheus-kps-dev"
  role_arn        = aws_iam_role.thanos_dev.arn
}

resource "aws_eks_pod_identity_association" "thanos_dev_store" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring-dev"
  service_account = "thanos-dev-storegateway"
  role_arn        = aws_iam_role.thanos_dev.arn
}

resource "aws_eks_pod_identity_association" "thanos_dev_compactor" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring-dev"
  service_account = "thanos-dev-compactor"
  role_arn        = aws_iam_role.thanos_dev.arn
}

output "thanos_dev_s3" {
  value = {
    bucket   = aws_s3_bucket.thanos_dev.id
    region   = aws_s3_bucket.thanos_dev.region
    role_arn = aws_iam_role.thanos_dev.arn
  }
}
