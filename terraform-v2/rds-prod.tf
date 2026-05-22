# Prod RDS — guardus-prod-pg-v2
# 옛 cluster RDS (guardus-prod-pg) 의 read replica 로 만들어진 후 promote 되어 standalone primary.
# 이 파일에서 IaC 로 import. password 는 Secrets Manager (guardus/rds/v2/master) 에서 별도 관리,
# terraform ignore_changes 로 drift 방지.

# ── Subnet group (옛 cluster 시절 이름 그대로) ─────────────────────
resource "aws_db_subnet_group" "rds_prod" {
  name = "guardus-prod-rds"
  subnet_ids = [
    "subnet-040d4c3ee2dfc4368",  # 2b
    "subnet-0292a16fdde7c75b7",  # 2d
    "subnet-08dfa510f7ac2301e",  # 2a
    "subnet-0ba768b69cc74eece",  # 2c
  ]
  tags = {
    Name = "guardus-prod-rds"
  }
}

# ── Security Group ────────────────────────────────────────────────
resource "aws_security_group" "rds_prod" {
  name        = "guardus-prod-rds-v2"
  description = "RDS v2 access from guardus-eks-v2 nodes"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# v2 cluster managed node SG 로부터 허용
resource "aws_vpc_security_group_ingress_rule" "rds_prod_from_node_sg" {
  security_group_id            = aws_security_group.rds_prod.id
  referenced_security_group_id = module.eks_v2.node_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# v2 cluster primary SG 로부터 허용 (pods 가 ENI 모드일 때 사용하는 SG)
resource "aws_vpc_security_group_ingress_rule" "rds_prod_from_cluster_sg" {
  security_group_id            = aws_security_group.rds_prod.id
  referenced_security_group_id = module.eks_v2.cluster_primary_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

# ── RDS instance ──────────────────────────────────────────────────
resource "aws_db_instance" "prod" {
  identifier     = "guardus-prod-pg-v2"
  engine         = "postgres"
  engine_version = "16.13"

  instance_class     = "db.t4g.medium"
  allocated_storage  = 20
  storage_type       = "gp3"
  storage_encrypted  = true
  kms_key_id         = "arn:aws:kms:ap-northeast-2:124052247302:key/e9d88d12-5da5-4fbc-a098-dcc9de23604f"
  iops               = 3000
  storage_throughput = 125

  db_name  = "guardus"
  username = "guardus_admin"
  # password 는 Secrets Manager (guardus/rds/v2/master) 에서 별도 관리.
  # lifecycle ignore_changes 로 drift 방지.
  password = "managed-via-secrets-manager"

  db_subnet_group_name   = aws_db_subnet_group.rds_prod.name
  vpc_security_group_ids = [aws_security_group.rds_prod.id]
  publicly_accessible    = false

  # ⚠️ 봇 데이터 무유실 원칙 (principle_no_outage_no_data_loss.md):
  #   - backup_retention_period 30일 (PITR 30일 가능)
  #   - deletion_protection: true (실수 삭제 차단)
  #   - skip_final_snapshot: false (destroy 시도 시 final snapshot 자동)
  # Multi-AZ 는 cost ~2x 라 의식적 예외 — AZ 장애 시 snapshot 으로 복구.
  backup_retention_period = 30
  backup_window           = "20:28-20:58"
  maintenance_window      = "sun:18:00-sun:19:00"
  copy_tags_to_snapshot   = true
  deletion_protection     = true

  performance_insights_enabled = false
  skip_final_snapshot          = false
  final_snapshot_identifier    = "guardus-prod-pg-v2-final"
  auto_minor_version_upgrade   = true

  ca_cert_identifier = "rds-ca-rsa2048-g1"

  lifecycle {
    ignore_changes = [password]
  }

  tags = {
    Name      = "guardus-prod-pg-v2"
    Env       = "prod"
    Component = "db-v2"
  }
}

# ── Outputs ───────────────────────────────────────────────────────
output "rds_prod" {
  value = {
    endpoint = aws_db_instance.prod.address
    port     = aws_db_instance.prod.port
    db_name  = aws_db_instance.prod.db_name
    secret   = "guardus/rds/v2/master"
  }
}
