# ═══════════════════════════════════════════════════════════════════════════
# Aether — Secrets Manager Module (NEW)
# Centralised secret management with automatic rotation.
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }

# ── KMS Key for Secrets ────────────────────────────────────────────────

resource "aws_kms_key" "secrets" {
  description             = "Aether secrets encryption key - ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = { Name = "aether-secrets-${var.environment}" }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/aether-secrets-${var.environment}"
  target_key_id = aws_kms_key.secrets.key_id
}

# ── Secrets ────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "rds_master" {
  name        = "aether/${var.environment}/rds/master"
  description = "Aurora PostgreSQL master credentials"
  kms_key_id  = aws_kms_key.secrets.arn

  replica {
    region = var.environment == "production" ? "us-west-2" : null
  }

  tags = { Service = "RDS" }
}

resource "aws_secretsmanager_secret" "neptune_auth" {
  name        = "aether/${var.environment}/neptune/master"
  description = "Neptune IAM auth configuration"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "Neptune" }
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name        = "aether/${var.environment}/redis/auth"
  description = "Redis AUTH token"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "ElastiCache" }
}

resource "aws_secretsmanager_secret" "opensearch_master" {
  name        = "aether/${var.environment}/opensearch/master"
  description = "OpenSearch admin credentials"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "OpenSearch" }
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "aether/${var.environment}/api/jwt-secret"
  description = "JWT signing secret for auth service"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "API" }
}

resource "aws_secretsmanager_secret" "encryption_key" {
  name        = "aether/${var.environment}/api/encryption-key"
  description = "AES-256 encryption key for PII"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "API" }
}

resource "aws_secretsmanager_secret" "pagerduty_key" {
  name        = "aether/${var.environment}/pagerduty/api-key"
  description = "PagerDuty integration key"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "Monitoring" }
}

resource "aws_secretsmanager_secret" "slack_webhook" {
  name        = "aether/${var.environment}/slack/webhook-url"
  description = "Slack webhook for alerts"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = { Service = "Monitoring" }
}

# ── Rotation Configuration ────────────────────────────────────────────

resource "aws_secretsmanager_secret_rotation" "rds_rotation" {
  count               = var.environment == "production" ? 1 : 0
  secret_id           = aws_secretsmanager_secret.rds_master.id
  rotation_lambda_arn = aws_lambda_function.secret_rotator[0].arn

  rotation_rules {
    automatically_after_days = 30
  }
}

# Lambda for secret rotation (production only)
resource "aws_lambda_function" "secret_rotator" {
  count         = var.environment == "production" ? 1 : 0
  function_name = "aether-secret-rotator-${var.environment}"
  runtime       = "python3.12"
  handler       = "index.handler"
  role          = aws_iam_role.rotation_lambda[0].arn
  timeout       = 30
  filename      = "${path.module}/rotation_lambda.zip"

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  tags = { Name = "aether-secret-rotator-${var.environment}" }
}

resource "aws_iam_role" "rotation_lambda" {
  count = var.environment == "production" ? 1 : 0
  name  = "aether-secret-rotator-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "rotation_lambda" {
  count = var.environment == "production" ? 1 : 0
  name  = "aether-secret-rotator-policy"
  role  = aws_iam_role.rotation_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage",
          "secretsmanager:DescribeSecret",
        ]
        Resource = "arn:aws:secretsmanager:*:*:secret:aether/${var.environment}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.secrets.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

# ── Outputs ────────────────────────────────────────────────────────────

output "kms_key_arn" {
  value = aws_kms_key.secrets.arn
}

output "secret_arns" {
  value = {
    rds       = aws_secretsmanager_secret.rds_master.arn
    neptune   = aws_secretsmanager_secret.neptune_auth.arn
    redis     = aws_secretsmanager_secret.redis_auth.arn
    opensearch = aws_secretsmanager_secret.opensearch_master.arn
    jwt       = aws_secretsmanager_secret.jwt_secret.arn
    encryption = aws_secretsmanager_secret.encryption_key.arn
  }
}
