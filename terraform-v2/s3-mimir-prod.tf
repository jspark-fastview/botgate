# Grafana Mimir prod — Prometheus metric 장기 보관 (S3 11-9 + multi-AZ).
# dev (monitoring-dev) 와 완전 분리. monitoring-prod namespace.
#
# 패턴: 기존 monitoring/KPS Prometheus 가 remoteWrite 로 push → Mimir prod.
# 새 prometheus-prod 따로 안 만듦 (운영 단순). KPS Prom 의 15d 는 단기 캐시.
#
# ⚠️ prod 도입 원칙 (principle_no_outage_no_data_loss.md):
#   - ingester replicas=3 + replication_factor=3 (quorum=2 안전, rolling restart 안전)
#   - zone-aware replication (b/d 2 AZ + host-spread)

# ── S3 bucket (prod 전용) ──────────────────────────────────────────
resource "aws_s3_bucket" "mimir_prod" {
  bucket = "guardus-mimir-metrics-prod"

  tags = {
    Name      = "guardus-mimir-metrics-prod"
    Component = "mimir"
    Env       = "prod"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mimir_prod" {
  bucket = aws_s3_bucket.mimir_prod.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "mimir_prod" {
  bucket = aws_s3_bucket.mimir_prod.id
  versioning_configuration {
    status = "Disabled"
  }
}

# Mimir compactor 가 자체 retention 처리. S3 lifecycle 은 보조 정리 (395d).
resource "aws_s3_bucket_lifecycle_configuration" "mimir_prod" {
  bucket = aws_s3_bucket.mimir_prod.id

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

resource "aws_s3_bucket_public_access_block" "mimir_prod" {
  bucket                  = aws_s3_bucket.mimir_prod.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role (Pod Identity, prod 전용) ────────────────────────────
resource "aws_iam_role" "mimir_prod" {
  name               = "guardus-mimir-prod"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_mimir_prod.json
  tags = {
    Component = "mimir"
    Env       = "prod"
  }
}

data "aws_iam_policy_document" "pod_identity_mimir_prod" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

resource "aws_iam_policy" "mimir_prod_s3" {
  name = "guardus-mimir-prod-s3"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.mimir_prod.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.mimir_prod.arn}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "mimir_prod_s3" {
  role       = aws_iam_role.mimir_prod.name
  policy_arn = aws_iam_policy.mimir_prod_s3.arn
}

# ── EKS Pod Identity (monitoring-prod/mimir SA) ────────────────────
resource "aws_eks_pod_identity_association" "mimir_prod" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring-prod"
  service_account = "mimir"
  role_arn        = aws_iam_role.mimir_prod.arn
}

output "mimir_prod_s3" {
  value = {
    bucket   = aws_s3_bucket.mimir_prod.id
    region   = aws_s3_bucket.mimir_prod.region
    role_arn = aws_iam_role.mimir_prod.arn
  }
}
