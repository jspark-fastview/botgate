# AWS Secrets Manager — 빈 stub 만 생성.
# 실제 값은 Terraform 밖에서 주입 (평문 state 회피):
#   aws secretsmanager put-secret-value --secret-id guardus/dev/admin-api \
#     --secret-string '{"ADMIN_KEY":"...","STATS_KEY":"..."}'
locals {
  secrets = {
    "guardus/dev/admin-api"  = "admin-api dev (ADMIN_KEY, STATS_KEY)"
    "guardus/dev/openresty"  = "openresty dev (GUARDUS_BYPASS_KEY)"
    "guardus/prod/admin-api" = "admin-api prod (ADMIN_KEY, STATS_KEY)"
    "guardus/prod/openresty" = "openresty prod (GUARDUS_BYPASS_KEY)"
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each    = local.secrets
  name        = each.key
  description = each.value

  # 학습용 — recovery window 0 으로 빠른 재생성 가능 (실수 시 즉시 영구 삭제)
  recovery_window_in_days = 0
}
