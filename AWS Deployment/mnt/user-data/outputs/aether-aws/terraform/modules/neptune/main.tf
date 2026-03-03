# ═══════════════════════════════════════════════════════════════════════════
# Aether Neptune Module — Graph Database
# db.r6g.xlarge (production), Multi-AZ, read replicas
# Continuous backups with 35-day point-in-time recovery
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) default = [] }

locals {
  instance_class = var.environment == "production" ? "db.r6g.xlarge" : (var.environment == "staging" ? "db.r6g.large" : "db.t4g.medium")
  reader_count   = var.environment == "production" ? 2 : 1
}

resource "aws_neptune_subnet_group" "main" {
  name       = "aether-neptune-${var.environment}"
  subnet_ids = var.subnet_ids
  tags       = { Name = "aether-neptune-subnet-${var.environment}" }
}

resource "aws_security_group" "neptune" {
  name_prefix = "aether-neptune-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 8182
    to_port         = 8182
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "Gremlin/SPARQL from ECS services"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-neptune-sg-${var.environment}" }
}

resource "aws_neptune_cluster" "main" {
  cluster_identifier                  = "aether-graph-${var.environment}"
  engine                              = "neptune"
  neptune_subnet_group_name           = aws_neptune_subnet_group.main.name
  vpc_security_group_ids              = [aws_security_group.neptune.id]
  backup_retention_period             = 35
  preferred_backup_window             = "03:00-04:00"
  deletion_protection                 = var.environment == "production"
  skip_final_snapshot                 = var.environment != "production"
  iam_database_authentication_enabled = true
  storage_encrypted                   = true

  tags = { Name = "aether-graph-${var.environment}" }
}

resource "aws_neptune_cluster_instance" "writer" {
  identifier         = "aether-graph-writer-${var.environment}"
  cluster_identifier = aws_neptune_cluster.main.id
  instance_class     = local.instance_class
  engine             = "neptune"
}

resource "aws_neptune_cluster_instance" "reader" {
  count              = local.reader_count
  identifier         = "aether-graph-reader-${count.index}-${var.environment}"
  cluster_identifier = aws_neptune_cluster.main.id
  instance_class     = local.instance_class
  engine             = "neptune"
}

output "cluster_endpoint" { value = aws_neptune_cluster.main.endpoint }
output "reader_endpoint"  { value = aws_neptune_cluster.main.reader_endpoint }
output "port"             { value = aws_neptune_cluster.main.port }
output "security_group_id" { value = aws_security_group.neptune.id }
