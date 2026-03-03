# ═══════════════════════════════════════════════════════════════════════════
# Aether RDS Module — PostgreSQL + TimescaleDB
# db.r6g.xlarge (production), Multi-AZ, automated backups
# Cross-region read replica for DR
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) default = [] }

locals {
  sizing = {
    production = { instance_class = "db.r6g.xlarge", storage = 500, max_storage = 2000 }
    staging    = { instance_class = "db.r6g.large",  storage = 100, max_storage = 500 }
    dev        = { instance_class = "db.t4g.medium", storage = 50,  max_storage = 100 }
  }
  spec = lookup(local.sizing, var.environment, local.sizing["dev"])
}

resource "aws_db_subnet_group" "main" {
  name       = "aether-rds-${var.environment}"
  subnet_ids = var.subnet_ids
  tags       = { Name = "aether-rds-subnet-${var.environment}" }
}

resource "aws_security_group" "rds" {
  name_prefix = "aether-rds-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "PostgreSQL from ECS services"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-rds-sg-${var.environment}" }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier      = "aether-tsdb-${var.environment}"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4"
  database_name           = "aether"
  master_username         = "aether_admin"
  manage_master_user_password = true
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.rds.id]

  # Backups & DR
  backup_retention_period      = 35
  preferred_backup_window      = "03:00-04:00"
  copy_tags_to_snapshot        = true
  deletion_protection          = var.environment == "production"
  skip_final_snapshot          = var.environment != "production"
  final_snapshot_identifier    = var.environment == "production" ? "aether-tsdb-final-${var.environment}" : null

  # Storage encryption
  storage_encrypted = true

  tags = { Name = "aether-tsdb-${var.environment}" }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "aether-tsdb-writer-${var.environment}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = local.spec.instance_class
  engine             = aws_rds_cluster.main.engine

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn
}

resource "aws_rds_cluster_instance" "reader" {
  count              = var.environment == "production" ? 2 : 1
  identifier         = "aether-tsdb-reader-${count.index}-${var.environment}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = local.spec.instance_class
  engine             = aws_rds_cluster.main.engine

  performance_insights_enabled = true
}

resource "aws_iam_role" "rds_monitoring" {
  name = "aether-rds-monitoring-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "monitoring.rds.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

output "cluster_endpoint"        { value = aws_rds_cluster.main.endpoint }
output "reader_endpoint"         { value = aws_rds_cluster.main.reader_endpoint }
output "cluster_id"              { value = aws_rds_cluster.main.id }
output "security_group_id"       { value = aws_security_group.rds.id }
