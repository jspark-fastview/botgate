# ElastiCache Redis — EKS 만 사용. EC2 는 무관.
# 노드: cache.t4g.small (1.37GB, 2 vCPU) Single-AZ Single-node (~$25/월)
# 용도: 세션 캐시 + stats 캐시 + 토큰 캐시
# 인증: AUTH token + TLS in-transit (Secrets Manager 에 저장)

# ── Subnet group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "redis" {
  name       = "guardus-prod-redis"
  subnet_ids = local.subnet_ids
  tags = {
    Name = "guardus-prod-redis"
  }
}

# ── Security Group ────────────────────────────────────────────────
# EKS 노드 SG 에서만 6379 inbound
resource "aws_security_group" "redis" {
  name        = "guardus-prod-redis"
  description = "Redis 6379 from EKS nodes only"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_nodes" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = module.eks.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "Redis from EKS managed node SG"
}

# ── AUTH token (Terraform 생성, Secrets Manager 저장) ─────────────
# Redis AUTH 는 16 char 이상. special 사용 X (URL escape 회피)
resource "random_password" "redis_auth" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name                    = "guardus/redis/prod/auth"
  recovery_window_in_days = 0 # 학습용 — 즉시 삭제 가능
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id = aws_secretsmanager_secret.redis_auth.id
  secret_string = jsonencode({
    host       = aws_elasticache_replication_group.redis.primary_endpoint_address
    port       = aws_elasticache_replication_group.redis.port
    auth_token = random_password.redis_auth.result
    # Spring Data Redis (Lettuce) 친화 URL — TLS + AUTH
    # rediss:// = TLS, default = Redis 기본 user
    url = "rediss://default:${random_password.redis_auth.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  })
}

# ── Redis replication group (Single-AZ, Single-node) ──────────────
# 단일 노드라도 AUTH + TLS 위해 replication_group 사용
# (aws_elasticache_cluster 는 AUTH/TLS 미지원)
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "guardus-prod-redis"
  description          = "GuardUs cache (sessions, stats, tokens)"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.small"
  port           = 6379

  # Single-AZ, Single-node
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  # 암호화
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  # 백업 — 학습용 비활성 (단일 노드라 의미 적음)
  snapshot_retention_limit = 0

  # 유지보수 윈도우 (UTC) — KST 02:00~03:00
  maintenance_window = "sun:17:00-sun:18:00"

  # 마이너 버전 자동 업그레이드 (7.1 patch 등)
  auto_minor_version_upgrade = true

  apply_immediately = true # 학습용

  tags = {
    Name = "${var.cluster_name}-redis"
  }
}
