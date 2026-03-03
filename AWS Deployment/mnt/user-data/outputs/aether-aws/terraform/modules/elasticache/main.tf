# ═══════════════════════════════════════════════════════════════════════════
# Aether ElastiCache Module — Redis Cluster Mode
# cache.r6g.large (production), 3 shards × 2 replicas, Multi-AZ failover
# Daily snapshots for DR
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) default = [] }

locals {
  sizing = {
    production = { node_type = "cache.r6g.large",  shards = 3, replicas = 2 }
    staging    = { node_type = "cache.r6g.large",  shards = 1, replicas = 1 }
    dev        = { node_type = "cache.t4g.medium", shards = 1, replicas = 0 }
  }
  spec = lookup(local.sizing, var.environment, local.sizing["dev"])
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "aether-redis-${var.environment}"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name_prefix = "aether-redis-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "Redis from ECS services"
  }

  egress {
    from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-redis-sg-${var.environment}" }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "aether-redis-${var.environment}"
  description          = "Aether Redis cluster — ${var.environment}"
  node_type            = local.spec.node_type
  num_node_groups      = local.spec.shards
  replicas_per_node_group = local.spec.replicas
  automatic_failover_enabled = local.spec.replicas > 0
  multi_az_enabled     = local.spec.replicas > 0
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = var.environment == "production" ? 7 : 1
  snapshot_window            = "04:00-05:00"
  engine                     = "redis"
  engine_version             = "7.1"
  parameter_group_name       = "default.redis7.cluster.on"
  port                       = 6379

  tags = { Name = "aether-redis-${var.environment}" }
}

output "primary_endpoint"       { value = aws_elasticache_replication_group.main.primary_endpoint_address }
output "configuration_endpoint" { value = aws_elasticache_replication_group.main.configuration_endpoint_address }
output "security_group_id"      { value = aws_security_group.redis.id }
