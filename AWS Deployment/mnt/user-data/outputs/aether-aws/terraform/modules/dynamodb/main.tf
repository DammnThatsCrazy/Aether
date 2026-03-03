# ═══════════════════════════════════════════════════════════════════════════
# Aether DynamoDB Module — Config Store
# On-demand capacity, point-in-time recovery, encryption
# Tables: tenants, api_keys, consent_records, agent_tasks, feature_flags
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "enable_global_tables" { type = bool default = false }
variable "dr_region" { type = string default = "us-west-2" }

locals {
  tables = {
    tenants = {
      hash_key  = "tenant_id"
      range_key = null
      gsis      = []
    }
    api_keys = {
      hash_key  = "key_hash"
      range_key = null
      gsis = [{
        name     = "tenant-index"
        hash_key = "tenant_id"
      }]
    }
    consent_records = {
      hash_key  = "tenant_id"
      range_key = "user_id"
      gsis      = []
    }
    agent_tasks = {
      hash_key  = "task_id"
      range_key = null
      gsis = [{
        name     = "status-index"
        hash_key = "status"
      }]
    }
    feature_flags = {
      hash_key  = "flag_key"
      range_key = "tenant_id"
      gsis      = []
    }
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each = local.tables

  name         = "aether_${each.key}_${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  attribute {
    name = each.value.hash_key
    type = "S"
  }

  dynamic "attribute" {
    for_each = each.value.range_key != null ? [each.value.range_key] : []
    content {
      name = attribute.value
      type = "S"
    }
  }

  dynamic "attribute" {
    for_each = each.value.gsis
    content {
      name = attribute.value.hash_key
      type = "S"
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.gsis
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      projection_type = "ALL"
    }
  }

  point_in_time_recovery { enabled = true }
  server_side_encryption { enabled = true }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = { Name = "aether_${each.key}_${var.environment}" }
}

output "table_arns" {
  value = { for k, v in aws_dynamodb_table.tables : k => v.arn }
}

output "table_names" {
  value = { for k, v in aws_dynamodb_table.tables : k => v.name }
}
