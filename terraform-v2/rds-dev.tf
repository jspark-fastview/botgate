# Dev 환경 RDS — guardus-prod-pg-dev (t4g.micro, 비용 ~$15/월)
# prod 와 같은 VPC/subnet group 재사용 (guardus-prod-rds-v2 만들지 않고 기존 dev 용 분리)

# ── Subnet group ──────────────────────────────────────────────────
resource "aws_db_subnet_group" "rds_dev" {
  name       = "guardus-prod-rds-dev"
  subnet_ids = local.subnet_ids  # b/d
  tags = {
    Name = "guardus-prod-rds-dev"
  }
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "rds_dev" {
  name        = "guardus-prod-rds-dev"
  description = "Postgres 5432 from guardus-eks-v2 nodes (dev environment)"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_dev_from_nodes" {
  security_group_id            = aws_security_group.rds_dev.id
  referenced_security_group_id = module.eks_v2.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Postgres from guardus-eks-v2 managed node SG (dev)"
}

# ── Master password ───────────────────────────────────────────────
resource "random_password" "rds_dev_master" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "rds_dev_master" {
  name                    = "guardus/rds/dev/master"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "rds_dev_master" {
  secret_id = aws_secretsmanager_secret.rds_dev_master.id
  secret_string = jsonencode({
    username = aws_db_instance.dev.username
    password = random_password.rds_dev_master.result
    host     = aws_db_instance.dev.address
    port     = aws_db_instance.dev.port
    dbname   = aws_db_instance.dev.db_name
    jdbc_url = "jdbc:postgresql://${aws_db_instance.dev.address}:${aws_db_instance.dev.port}/${aws_db_instance.dev.db_name}"
  })
}

# ── Postgres 인스턴스 (Dev — 작은 인스턴스, 백업 1일) ───────────────
resource "aws_db_instance" "dev" {
  identifier     = "guardus-prod-pg-dev"
  engine         = "postgres"
  engine_version = "16.13"

  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "guardus"
  username = "guardus_admin"
  password = random_password.rds_dev_master.result

  db_subnet_group_name   = aws_db_subnet_group.rds_dev.name
  vpc_security_group_ids = [aws_security_group.rds_dev.id]
  publicly_accessible    = false

  backup_retention_period = 1
  backup_window           = "17:00-18:00"
  maintenance_window      = "sun:18:00-sun:19:00"
  copy_tags_to_snapshot   = true
  deletion_protection     = false

  performance_insights_enabled = false
  skip_final_snapshot          = true
  auto_minor_version_upgrade   = true
  apply_immediately            = true

  tags = {
    Name      = "guardus-prod-pg-dev"
    Env       = "dev"
    Component = "db"
  }
}

# ── Outputs ───────────────────────────────────────────────────────
output "rds_dev" {
  value = {
    endpoint  = aws_db_instance.dev.address
    port      = aws_db_instance.dev.port
    db_name   = aws_db_instance.dev.db_name
    secret_id = aws_secretsmanager_secret.rds_dev_master.name
    jdbc_url  = "jdbc:postgresql://${aws_db_instance.dev.address}:${aws_db_instance.dev.port}/${aws_db_instance.dev.db_name}"
  }
}
