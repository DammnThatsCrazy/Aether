# ═══════════════════════════════════════════════════════════════════════════
# Aether OpenSearch Module — Vector Store
# r6g.large.search (production), 3 nodes, k-NN plugin enabled
# Used for: embedding similarity search, log indexing
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "allowed_security_groups" { type = list(string) default = [] }

locals {
  sizing = {
    production = { instance_type = "r6g.large.search",  instance_count = 3, volume_size = 200 }
    staging    = { instance_type = "r6g.large.search",  instance_count = 2, volume_size = 50 }
    dev        = { instance_type = "t3.medium.search",  instance_count = 1, volume_size = 20 }
  }
  spec = lookup(local.sizing, var.environment, local.sizing["dev"])
}

resource "aws_security_group" "opensearch" {
  name_prefix = "aether-opensearch-${var.environment}-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = var.allowed_security_groups
    description     = "HTTPS from ECS services"
  }

  egress {
    from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-opensearch-sg-${var.environment}" }
}

resource "aws_opensearch_domain" "main" {
  domain_name    = "aether-${var.environment}"
  engine_version = "OpenSearch_2.11"

  cluster_config {
    instance_type          = local.spec.instance_type
    instance_count         = local.spec.instance_count
    zone_awareness_enabled = local.spec.instance_count > 1

    dynamic "zone_awareness_config" {
      for_each = local.spec.instance_count > 1 ? [1] : []
      content {
        availability_zone_count = min(local.spec.instance_count, 3)
      }
    }
  }

  ebs_options {
    ebs_enabled = true
    volume_size = local.spec.volume_size
    volume_type = "gp3"
    throughput  = 250
  }

  vpc_options {
    subnet_ids         = slice(var.subnet_ids, 0, min(local.spec.instance_count, 3))
    security_group_ids = [aws_security_group.opensearch.id]
  }

  encrypt_at_rest { enabled = true }
  node_to_node_encryption { enabled = true }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_options = {
    "rest.action.multi.allow_explicit_index" = "true"
    "override_main_response_version"         = "false"
  }

  tags = { Name = "aether-opensearch-${var.environment}" }
}

output "endpoint"          { value = aws_opensearch_domain.main.endpoint }
output "domain_arn"        { value = aws_opensearch_domain.main.arn }
output "security_group_id" { value = aws_security_group.opensearch.id }
