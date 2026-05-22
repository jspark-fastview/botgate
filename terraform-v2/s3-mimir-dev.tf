# Grafana Mimir dev 전용 — Prometheus metric 장기 보관 (S3 11-9 durability + multi-AZ).
# prod monitoring (monitoring ns + KPS, 15d EBS) 와 완전 분리.
#
# 패턴: Prometheus 가 remoteWrite 로 Mimir 에 push → Mimir 가 S3 영구 저장.
# monolithic 모드 권장 (단일 binary, 운영 부담 최소).
# 검증 후 prod KPS 도 remoteWrite 추가 예정 (Mimir multi-tenant 로 격리).

# ── S3 bucket (dev 전용) ───────────────────────────────────────────
resource "aws_s3_bucket" "mimir_dev" {
  bucket = "guardus-mimir-metrics-dev"

  tags = {
    Name      = "guardus-mimir-metrics-dev"
    Component = "mimir"
    Env       = "dev"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "mimir_dev" {
  bucket = aws_s3_bucket.mimir_dev.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "mimir_dev" {
  bucket = aws_s3_bucket.mimir_dev.id
  versioning_configuration {
    status = "Disabled"
  }
}

# Mimir 자체 compactor 가 retention 처리.
# Mimir retention 기본: blocks_storage.tsdb.retention_period (보통 13개월/limits 의 compactor_block_max_retention).
# S3 lifecycle 은 보조 정리 (395d = 13개월 + 30d buffer).
resource "aws_s3_bucket_lifecycle_configuration" "mimir_dev" {
  bucket = aws_s3_bucket.mimir_dev.id

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

resource "aws_s3_bucket_public_access_block" "mimir_dev" {
  bucket                  = aws_s3_bucket.mimir_dev.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role (Pod Identity, dev 전용) ─────────────────────────────
resource "aws_iam_role" "mimir_dev" {
  name               = "guardus-mimir-dev"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_mimir_dev.json
  tags = {
    Component = "mimir"
    Env       = "dev"
  }
}

data "aws_iam_policy_document" "pod_identity_mimir_dev" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

resource "aws_iam_policy" "mimir_dev_s3" {
  name = "guardus-mimir-dev-s3"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.mimir_dev.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.mimir_dev.arn}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "mimir_dev_s3" {
  role       = aws_iam_role.mimir_dev.name
  policy_arn = aws_iam_policy.mimir_dev_s3.arn
}

# ── EKS Pod Identity (monolithic 모드: SA 1개) ────────────────────
# helm chart grafana/mimir-distributed 의 monolithic 모드 기본 SA name = 'mimir'.
# 또는 chart values 의 serviceAccount.name 으로 명시 가능 — Phase 2 에서 'mimir' 로 잡음.
resource "aws_eks_pod_identity_association" "mimir_dev" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring-dev"
  service_account = "mimir"
  role_arn        = aws_iam_role.mimir_dev.arn
}

output "mimir_dev_s3" {
  value = {
    bucket   = aws_s3_bucket.mimir_dev.id
    region   = aws_s3_bucket.mimir_dev.region
    role_arn = aws_iam_role.mimir_dev.arn
  }
}
