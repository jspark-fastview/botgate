# RDS Postgres 16 — EKS 만 사용 (옵션 2, EC2 SQLite 유지).
# 인스턴스: db.t4g.medium (2 vCPU, 4GB) — 학습용 충분
# Multi-AZ: OFF, Single-AZ. backup 7일.
# 인증: master password (auto-generated, Secrets Manager 에 저장).

# ── Subnet group ──────────────────────────────────────────────────
# content-vpc 의 a/c 서브넷 사용 (data 는 vpc.tf 에서 정의)
resource "aws_db_subnet_group" "rds" {
  name       = "guardus-prod-rds"
  subnet_ids = local.subnet_ids
  tags = {
    Name = "guardus-prod-rds"
  }
}

# ── Security Group ────────────────────────────────────────────────
# EKS 노드 SG 에서만 5432 inbound
resource "aws_security_group" "rds" {
  name        = "guardus-prod-rds"
  description = "Postgres 5432 from EKS nodes only"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_nodes" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = module.eks.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Postgres from EKS managed node SG"
}

# ── Master password — Terraform 생성 + Secrets Manager 저장 ───────
# 우리 ESO 로 K8s Secret 동기화 가능하도록 (rds!db-... 자동 이름 회피)
resource "random_password" "rds_master" {
  length  = 32
  special = false   # JDBC URL 안전 (특수문자 escape 회피)
}

resource "aws_secretsmanager_secret" "rds_master" {
  name                    = "guardus/rds/prod/master"
  recovery_window_in_days = 0    # 학습용 — 즉시 삭제 가능
}

resource "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = aws_secretsmanager_secret.rds_master.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.rds_master.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
    # JDBC URL 통째로 — app 이 그대로 사용
    jdbc_url = "jdbc:postgresql://${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  })
}

# ── Postgres 인스턴스 ─────────────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier     = "guardus-prod-pg"
  engine         = "postgres"
  engine_version = "16.4"

  instance_class    = "db.t4g.medium"
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "guardus"
  username = "guardus_admin"
  password = random_password.rds_master.result

  db_subnet_group_name   = aws_db_subnet_group.rds.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false       # private — EKS 내부에서만 접근

  # 백업 / 유지보수
  backup_retention_period = 7
  backup_window           = "17:00-18:00"   # UTC = KST 02:00~03:00
  maintenance_window      = "sun:18:00-sun:19:00"
  copy_tags_to_snapshot   = true
  deletion_protection     = false           # 학습용 — 운영은 true

  # CloudWatch logs
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # 성능 인사이트 — 학습용엔 비활성 (월 $7)
  performance_insights_enabled = false

  # 학습용 — 종료 시 final snapshot 생략
  skip_final_snapshot = true

  # 마이너 버전 자동 업그레이드 (16.4 → 16.5 등)
  auto_minor_version_upgrade = true

  apply_immediately = true   # 학습용 — 변경 즉시 반영

  tags = {
    Name = "${var.cluster_name}-pg"
  }
}
