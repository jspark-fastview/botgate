# ECR 레포지토리 × 4 (admin-api / internal-api / openresty / frontend)
locals {
  components = ["admin-api", "internal-api", "openresty", "frontend"]
}

resource "aws_ecr_repository" "this" {
  for_each = toset(local.components)

  name                 = "guardus/${each.key}"
  image_tag_mutability = "MUTABLE"   # :dev tag 가 매번 덮어쓰임

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# 라이프사이클 — :dev 은 최근 10개만, SHA 태그는 30일 후 만료
resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 :dev images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["dev"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      }
    ]
  })
}
