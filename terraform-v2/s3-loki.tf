# Loki chunks + ruler + admin 객체를 S3 로 저장.
# 단일 EBS 의존 사고 (2026-05-20 AZ mismatch) 후 backend 변경.

# ── S3 bucket ─────────────────────────────────────────────────────
resource "aws_s3_bucket" "loki" {
  bucket = "guardus-loki-chunks-v2"

  tags = {
    Name      = "guardus-loki-chunks-v2"
    Component = "loki"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "loki" {
  bucket = aws_s3_bucket.loki.id
  versioning_configuration {
    status = "Disabled"
  }
}

# ── Loki retention (Loki 가 chunks 자체 retention 처리, S3 lifecycle 은 보조) ──
resource "aws_s3_bucket_lifecycle_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  rule {
    id     = "expire-old-chunks"
    status = "Enabled"
    filter {}
    # Loki retention_period 60d 와 일관성. 그 후 S3 가 자체 정리 (보조).
    expiration { days = 90 }
    # 비완료 multipart 정리
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "loki" {
  bucket                  = aws_s3_bucket.loki.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role for Loki (Pod Identity) ──────────────────────────────
resource "aws_iam_role" "loki" {
  name               = "guardus-loki"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_loki.json
  tags = {
    Component = "loki"
  }
}

data "aws_iam_policy_document" "pod_identity_loki" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

resource "aws_iam_policy" "loki_s3" {
  name = "guardus-loki-s3"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.loki.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.loki.arn}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "loki_s3" {
  role       = aws_iam_role.loki.name
  policy_arn = aws_iam_policy.loki_s3.arn
}

# ── EKS Pod Identity association (loki ServiceAccount → IAM role) ──
resource "aws_eks_pod_identity_association" "loki" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring"
  service_account = "loki"
  role_arn        = aws_iam_role.loki.arn
}

output "loki_s3" {
  value = {
    bucket   = aws_s3_bucket.loki.id
    region   = aws_s3_bucket.loki.region
    role_arn = aws_iam_role.loki.arn
  }
}
