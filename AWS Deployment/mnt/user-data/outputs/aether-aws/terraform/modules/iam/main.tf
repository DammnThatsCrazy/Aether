# ═══════════════════════════════════════════════════════════════════════════
# Aether IAM Module
# Cross-account roles, CI/CD roles, service-linked roles
# Least privilege policies per service
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "data_account_id" { type = string default = "444444444444" }
variable "security_account_id" { type = string default = "555555555555" }

# ── CI/CD Pipeline Role ──────────────────────────────────────────────

resource "aws_iam_role" "ci_cd" {
  name = "aether-cicd-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRoleWithWebIdentity"
      Effect    = "Allow"
      Principal = { Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com" }
      Condition = { StringLike = { "token.actions.githubusercontent.com:sub" = "repo:aether-org/aether:*" } }
    }]
  })
}

resource "aws_iam_role_policy" "ci_cd" {
  name = "cicd-deploy-policy"
  role = aws_iam_role.ci_cd.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:*"], Resource = "*" },
      { Effect = "Allow", Action = ["ecs:UpdateService", "ecs:DescribeServices", "ecs:RegisterTaskDefinition"], Resource = "*" },
      { Effect = "Allow", Action = ["iam:PassRole"], Resource = "*", Condition = { StringLike = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"], Resource = ["arn:aws:s3:::aether-*"] },
      { Effect = "Allow", Action = ["elasticloadbalancing:ModifyRule", "elasticloadbalancing:DescribeRules"], Resource = "*" },
    ]
  })
}

# ── Cross-Account Data Access (production → data) ────────────────────

resource "aws_iam_role" "data_access" {
  count = var.environment == "production" ? 1 : 0
  name  = "aether-data-access-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.data_account_id}:root" }
    }]
  })
}

# ── Cross-Account Security Logging ────────────────────────────────────

resource "aws_iam_role" "security_audit" {
  name = "aether-security-audit-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.security_account_id}:root" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "security_audit" {
  role       = aws_iam_role.security_audit.name
  policy_arn = "arn:aws:iam::aws:policy/SecurityAudit"
}

# ── CloudTrail ────────────────────────────────────────────────────────

resource "aws_cloudtrail" "main" {
  name                       = "aether-trail-${var.environment}"
  s3_bucket_name             = "aether-cloudtrail-${var.environment}"
  is_multi_region_trail      = true
  enable_log_file_validation = true
  enable_logging             = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = { Name = "aether-trail-${var.environment}" }
}

# ── GuardDuty ─────────────────────────────────────────────────────────

resource "aws_guardduty_detector" "main" {
  enable = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
  tags   = { Name = "aether-guardduty-${var.environment}" }
}

data "aws_caller_identity" "current" {}

output "ci_cd_role_arn"       { value = aws_iam_role.ci_cd.arn }
output "security_audit_role"  { value = aws_iam_role.security_audit.arn }
output "guardduty_detector_id" { value = aws_guardduty_detector.main.id }
