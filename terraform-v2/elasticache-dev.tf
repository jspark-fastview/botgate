# Dev 환경 Redis — guardus-prod-redis-dev (cache.t4g.micro, 비용 ~$10/월)

# ── Subnet group ──────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "redis_dev" {
  name       = "guardus-prod-redis-dev"
  subnet_ids = local.subnet_ids  # b/d
  tags = {
    Name = "guardus-prod-redis-dev"
  }
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "redis_dev" {
  name        = "guardus-prod-redis-dev"
  description = "Redis 6379 from guardus-eks-v2 nodes (dev environment)"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_dev_from_nodes" {
  security_group_id            = aws_security_group.redis_dev.id
  referenced_security_group_id = module.eks_v2.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "Redis from guardus-eks-v2 managed node SG (dev)"
}

# ── AUTH token ────────────────────────────────────────────────────
resource "random_password" "redis_dev_auth" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "redis_dev_auth" {
  name                    = "guardus/redis/dev/auth"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis_dev_auth" {
  secret_id = aws_secretsmanager_secret.redis_dev_auth.id
  secret_string = jsonencode({
    host       = aws_elasticache_replication_group.redis_dev.primary_endpoint_address
    port       = aws_elasticache_replication_group.redis_dev.port
    auth_token = random_password.redis_dev_auth.result
    url        = "rediss://default:${random_password.redis_dev_auth.result}@${aws_elasticache_replication_group.redis_dev.primary_endpoint_address}:${aws_elasticache_replication_group.redis_dev.port}"
  })
}

# ── Redis replication group ──────────────────────────────────────
resource "aws_elasticache_replication_group" "redis_dev" {
  replication_group_id = "guardus-prod-redis-dev"
  description          = "GuardUs cache dev (cluster guardus-eks-v2)"

  # 2026-05-20: Valkey 7.2 → 9.0 (prod 와 일관성)
  engine         = "valkey"
  engine_version = "9.0"
  node_type      = "cache.t4g.micro"
  port           = 6379

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  parameter_group_name = "default.valkey9"
  subnet_group_name    = aws_elasticache_subnet_group.redis_dev.name
  security_group_ids   = [aws_security_group.redis_dev.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_dev_auth.result

  snapshot_retention_limit   = 0
  maintenance_window         = "sun:17:00-sun:18:00"
  auto_minor_version_upgrade = true
  apply_immediately          = true

  tags = {
    Name = "guardus-prod-redis-dev"
    Env  = "dev"
  }
}

# ── Outputs ───────────────────────────────────────────────────────
output "redis_dev" {
  value = {
    endpoint  = aws_elasticache_replication_group.redis_dev.primary_endpoint_address
    port      = aws_elasticache_replication_group.redis_dev.port
    secret_id = aws_secretsmanager_secret.redis_dev_auth.name
  }
}
