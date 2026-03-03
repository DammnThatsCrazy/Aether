# ═══════════════════════════════════════════════════════════════════════════
# Aether WAF Module
# AWS WAF on CloudFront and ALB
# DDoS protection, rate limiting, bot mitigation
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "alb_arn" { type = string default = "" }

resource "aws_wafv2_web_acl" "main" {
  name        = "aether-waf-${var.environment}"
  scope       = "REGIONAL"
  description = "Aether WAF — ${var.environment}"

  default_action { allow {} }

  # Rate limiting: 2000 requests per 5 minutes per IP
  rule {
    name     = "rate-limit"
    priority = 1

    action { block {} }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aether-rate-limit-${var.environment}"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules — Common Rule Set
  rule {
    name     = "aws-common-rules"
    priority = 2

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aether-common-rules-${var.environment}"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules — Known Bad Inputs
  rule {
    name     = "aws-bad-inputs"
    priority = 3

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aether-bad-inputs-${var.environment}"
      sampled_requests_enabled   = true
    }
  }

  # Bot Control
  rule {
    name     = "bot-control"
    priority = 4

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesBotControlRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aether-bot-control-${var.environment}"
      sampled_requests_enabled   = true
    }
  }

  # IP Reputation
  rule {
    name     = "ip-reputation"
    priority = 5

    override_action { none {} }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aether-ip-reputation-${var.environment}"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "aether-waf-${var.environment}"
    sampled_requests_enabled   = true
  }

  tags = { Name = "aether-waf-${var.environment}" }
}

# Associate with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.alb_arn != "" ? 1 : 0
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# WAF Logging
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-aether-${var.environment}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn
}

output "web_acl_arn" { value = aws_wafv2_web_acl.main.arn }
output "web_acl_id"  { value = aws_wafv2_web_acl.main.id }
