# State backend — S3.
# Terraform 1.10+ 의 use_lockfile 사용 → DynamoDB lock table 불필요
# (S3 conditional writes 가 lock 역할, 2024.11~).
#
# 선행 작업 (AWS CLI 로 1회 실행) — README 참조:
#   1. S3 bucket 생성 (versioning + encryption + block public access)
#   2. terraform init 시 local → S3 자동 migrate

terraform {
  backend "s3" {
    bucket       = "guardus-tfstate-124052247302"
    key          = "eks/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
