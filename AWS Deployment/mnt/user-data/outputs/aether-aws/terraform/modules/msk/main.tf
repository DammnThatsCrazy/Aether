# ═══════════════════════════════════════════════════════════════════════════
# Aether MSK Module — Managed Kafka
# kafka.m5.large, 3 brokers across 3 AZs
# Multi-AZ replication, topic-level retention policies
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) default = [] }

locals {
  broker_type = var.environment == "production" ? "kafka.m5.large" : "kafka.t3.small"
  broker_count = 3
  ebs_size = var.environment == "production" ? 500 : 50
}

resource "aws_security_group" "msk" {
  name_prefix = "aether-msk-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9098
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "Kafka from ECS services"
  }

  ingress {
    from_port       = 2181
    to_port         = 2181
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "ZooKeeper"
  }

  egress {
    from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-msk-sg-${var.environment}" }
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/aether-${var.environment}"
  retention_in_days = 30
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "aether-kafka-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = local.broker_count

  broker_node_group_info {
    instance_type   = local.broker_type
    client_subnets  = var.subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = local.ebs_size
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = { Name = "aether-kafka-${var.environment}" }
}

resource "aws_msk_configuration" "main" {
  name              = "aether-kafka-config-${var.environment}"
  kafka_versions    = ["3.6.0"]

  server_properties = <<-PROPERTIES
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=6
    log.retention.hours=${var.environment == "production" ? 168 : 24}
    log.retention.bytes=${var.environment == "production" ? -1 : 1073741824}
    unclean.leader.election.enable=false
    message.max.bytes=10485760
  PROPERTIES
}

output "bootstrap_brokers_tls" { value = aws_msk_cluster.main.bootstrap_brokers_tls }
output "zookeeper_connect"     { value = aws_msk_cluster.main.zookeeper_connect_string }
output "cluster_arn"           { value = aws_msk_cluster.main.arn }
output "security_group_id"    { value = aws_security_group.msk.id }
