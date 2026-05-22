# Thanos metric 장기 보관 — Prometheus 의 15d EBS retention 대신 S3 (11-9 durability, multi-AZ).
# 단일 EBS 의존 위험 (2026-05-19 PVC AZ mismatch 사고) 회피.
#
# Pod Identity 분리 — sidecar (write) / store + compactor (read+delete) 같은 role 공유 가능.
# Loki 가 단일 IAM role 인 패턴 따름.

# ── S3 bucket ─────────────────────────────────────────────────────
resource "aws_s3_bucket" "thanos" {
  bucket = "guardus-thanos-metrics-v2"

  tags = {
    Name      = "guardus-thanos-metrics-v2"
    Component = "thanos"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "thanos" {
  bucket = aws_s3_bucket.thanos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "thanos" {
  bucket = aws_s3_bucket.thanos.id
  versioning_configuration {
    status = "Disabled"
  }
}

# ── Lifecycle (compactor 가 자체 retention 처리, S3 lifecycle 은 보조) ──
# Thanos retention 정책:
#   - raw (원본 해상도): 30d
#   - 5m downsampling:   90d
#   - 1h downsampling:   365d (1년)
# 그 후 S3 lifecycle 이 정리 (1년 + 30d buffer = 395d).
resource "aws_s3_bucket_lifecycle_configuration" "thanos" {
  bucket = aws_s3_bucket.thanos.id

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

resource "aws_s3_bucket_public_access_block" "thanos" {
  bucket                  = aws_s3_bucket.thanos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM role (Pod Identity) ───────────────────────────────────────
# sidecar / store / compactor 가 같은 role 공유. namespace=monitoring 에서 3개 SA association.
resource "aws_iam_role" "thanos" {
  name               = "guardus-thanos"
  assume_role_policy = data.aws_iam_policy_document.pod_identity_thanos.json
  tags = {
    Component = "thanos"
  }
}

data "aws_iam_policy_document" "pod_identity_thanos" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
    actions = ["sts:AssumeRole", "sts:TagSession"]
  }
}

resource "aws_iam_policy" "thanos_s3" {
  name = "guardus-thanos-s3"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.thanos.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.thanos.arn}/*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "thanos_s3" {
  role       = aws_iam_role.thanos.name
  policy_arn = aws_iam_policy.thanos_s3.arn
}

# ── EKS Pod Identity associations ─────────────────────────────────
# Prometheus pod (kps-prometheus statefulset 의 SA) 가 sidecar 와 같이 동작 — sidecar 가 S3 write.
# kube-prometheus-stack 의 prometheus SA name 은 기본 'kps-prometheus' (releaseName + '-prometheus').
resource "aws_eks_pod_identity_association" "thanos_sidecar" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring"
  service_account = "kps-prometheus"
  role_arn        = aws_iam_role.thanos.arn
}

# thanos-store / query / compactor 는 별도 SA. helm chart 기본 이름.
resource "aws_eks_pod_identity_association" "thanos_store" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring"
  service_account = "thanos-storegateway"
  role_arn        = aws_iam_role.thanos.arn
}

resource "aws_eks_pod_identity_association" "thanos_compactor" {
  cluster_name    = module.eks_v2.cluster_name
  namespace       = "monitoring"
  service_account = "thanos-compactor"
  role_arn        = aws_iam_role.thanos.arn
}

output "thanos_s3" {
  value = {
    bucket   = aws_s3_bucket.thanos.id
    region   = aws_s3_bucket.thanos.region
    role_arn = aws_iam_role.thanos.arn
  }
}
