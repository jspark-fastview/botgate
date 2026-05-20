# ElastiCache Redis v2 — guardus-eks-v2 cluster 전용. 새 AZ (2b).
# 옛 Redis (guardus-prod-redis @ 2a) 와 분리. 데이터 = cache 라 sync 불필요.

# ── Subnet group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "redis_v2" {
  name       = "guardus-prod-redis-v2"
  subnet_ids = local.subnet_ids  # b/d
  tags = {
    Name = "guardus-prod-redis-v2"
  }
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "redis_v2" {
  name        = "guardus-prod-redis-v2"
  description = "Redis 6379 from guardus-eks-v2 nodes only"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_v2_from_nodes" {
  security_group_id            = aws_security_group.redis_v2.id
  referenced_security_group_id = module.eks_v2.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "Redis from guardus-eks-v2 managed node SG"
}

# ── AUTH token ────────────────────────────────────────────────────
resource "random_password" "redis_v2_auth" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "redis_v2_auth" {
  name                    = "guardus/redis/v2/auth"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis_v2_auth" {
  secret_id = aws_secretsmanager_secret.redis_v2_auth.id
  secret_string = jsonencode({
    host       = aws_elasticache_replication_group.redis_v2.primary_endpoint_address
    port       = aws_elasticache_replication_group.redis_v2.port
    auth_token = random_password.redis_v2_auth.result
    url        = "rediss://default:${random_password.redis_v2_auth.result}@${aws_elasticache_replication_group.redis_v2.primary_endpoint_address}:${aws_elasticache_replication_group.redis_v2.port}"
  })
}

# ── Redis replication group (Single-AZ @ 2b) ──────────────────────
resource "aws_elasticache_replication_group" "redis_v2" {
  replication_group_id = "guardus-prod-redis-v2"
  description          = "GuardUs cache v2 (cluster guardus-eks-v2)"

  engine         = "redis"
  engine_version = "7.1"
  node_type      = "cache.t4g.small"
  port           = 6379

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis_v2.name
  security_group_ids   = [aws_security_group.redis_v2.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_v2_auth.result

  snapshot_retention_limit = 0
  maintenance_window       = "sun:17:00-sun:18:00"
  auto_minor_version_upgrade = true
  apply_immediately = true

  tags = {
    Name = "${var.cluster_name}-redis"
  }
}

# ── Outputs ───────────────────────────────────────────────────────
output "redis_v2" {
  value = {
    endpoint = aws_elasticache_replication_group.redis_v2.primary_endpoint_address
    port     = aws_elasticache_replication_group.redis_v2.port
    secret_id = aws_secretsmanager_secret.redis_v2_auth.name
  }
}
