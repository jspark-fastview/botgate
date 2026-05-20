# State backend — S3.
# 옛 terraform/ 와 분리된 key. 옛 state 와 충돌 없음.
terraform {
  backend "s3" {
    bucket       = "guardus-tfstate-124052247302"
    key          = "eks-v2/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
