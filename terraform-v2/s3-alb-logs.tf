# ALB access log S3 bucket — 사고 시 정확한 reason 분석.
# 2026-05-25 spot interruption 다발 사고 — access log 비활성으로 정확 원인 파악 못 함.

resource "aws_s3_bucket" "alb_logs" {
  bucket = "guardus-alb-access-logs"
  tags = {
    Name      = "guardus-alb-access-logs"
    Component = "alb"
  }
}

# ALB 가 access log 쓸 수 있도록 권한 부여
# ap-northeast-2 의 ELB account ID = 600734575887 (AWS docs)
resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::600734575887:root" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/AWSLogs/${var.aws_account_id}/*"
      },
      {
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.alb_logs.arn}/AWSLogs/${var.aws_account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.alb_logs.arn
      },
    ]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-old-access-logs"
    status = "Enabled"
    filter {}
    expiration { days = 60 }   # 60일 보관 (사후 분석 충분)
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "alb_logs_s3" {
  value = {
    bucket = aws_s3_bucket.alb_logs.id
    region = aws_s3_bucket.alb_logs.region
  }
}
