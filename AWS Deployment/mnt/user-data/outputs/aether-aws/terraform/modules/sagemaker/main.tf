# ═══════════════════════════════════════════════════════════════════════════
# Aether SageMaker Module — ML Model Serving
# Multi-model endpoints, auto-scaling on inference count
# Online + Offline Feature Store
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "ml_artifacts_bucket" { type = string }

locals {
  instance_type = var.environment == "production" ? "ml.g4dn.xlarge" : "ml.t2.medium"
  min_instances = var.environment == "production" ? 2 : 1
  max_instances = var.environment == "production" ? 10 : 2

  models = [
    # Edge models
    "intent-prediction",
    "bot-detection",
    "session-scorer",
    # Server models
    "identity-gnn",
    "journey-tft",
    "churn-prediction",
    "ltv-prediction",
    "anomaly-detection",
    "campaign-attribution",
  ]
}

resource "aws_security_group" "sagemaker" {
  name_prefix = "aether-sagemaker-${var.environment}-"
  vpc_id      = var.vpc_id

  egress {
    from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "aether-sagemaker-sg-${var.environment}" }
}

# ── IAM Role for SageMaker ────────────────────────────────────────────

resource "aws_iam_role" "sagemaker" {
  name = "aether-sagemaker-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole", Effect = "Allow",
      Principal = { Service = "sagemaker.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "sagemaker_s3" {
  name = "sagemaker-s3-access"
  role = aws_iam_role.sagemaker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::${var.ml_artifacts_bucket}",
        "arn:aws:s3:::${var.ml_artifacts_bucket}/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "sagemaker_full" {
  role       = aws_iam_role.sagemaker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
}

# ── Multi-Model Endpoint ──────────────────────────────────────────────

resource "aws_sagemaker_model" "multi_model" {
  name               = "aether-multi-model-${var.environment}"
  execution_role_arn = aws_iam_role.sagemaker.arn

  primary_container {
    image          = "763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:2.1-gpu-py310-cu121-ubuntu20.04-sagemaker"
    mode           = "MultiModel"
    model_data_url = "s3://${var.ml_artifacts_bucket}/models/"
  }

  vpc_config {
    subnets            = var.subnet_ids
    security_group_ids = [aws_security_group.sagemaker.id]
  }

  tags = { Name = "aether-multi-model-${var.environment}" }
}

resource "aws_sagemaker_endpoint_configuration" "main" {
  name = "aether-endpoint-config-${var.environment}"

  production_variants {
    variant_name           = "primary"
    model_name             = aws_sagemaker_model.multi_model.name
    instance_type          = local.instance_type
    initial_instance_count = local.min_instances
    initial_variant_weight = 1.0
  }

  tags = { Name = "aether-endpoint-config-${var.environment}" }
}

resource "aws_sagemaker_endpoint" "main" {
  name                 = "aether-inference-${var.environment}"
  endpoint_config_name = aws_sagemaker_endpoint_configuration.main.name

  tags = { Name = "aether-inference-${var.environment}" }
}

# ── Auto-scaling for endpoint ─────────────────────────────────────────

resource "aws_appautoscaling_target" "sagemaker" {
  max_capacity       = local.max_instances
  min_capacity       = local.min_instances
  resource_id        = "endpoint/${aws_sagemaker_endpoint.main.name}/variant/primary"
  scalable_dimension = "sagemaker:variant:DesiredInstanceCount"
  service_namespace  = "sagemaker"
}

resource "aws_appautoscaling_policy" "sagemaker_invocations" {
  name               = "aether-sagemaker-scaling-${var.environment}"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.sagemaker.resource_id
  scalable_dimension = aws_appautoscaling_target.sagemaker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.sagemaker.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value = 750  # invocations per instance per minute
    predefined_metric_specification {
      predefined_metric_type = "SageMakerVariantInvocationsPerInstance"
    }
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ── Feature Store ─────────────────────────────────────────────────────

resource "aws_sagemaker_feature_group" "user_features" {
  feature_group_name             = "aether-user-features-${var.environment}"
  record_identifier_feature_name = "user_id"
  event_time_feature_name        = "event_time"
  role_arn                       = aws_iam_role.sagemaker.arn

  online_store_config { enable_online_store = true }
  offline_store_config {
    s3_storage_config {
      s3_uri = "s3://${var.ml_artifacts_bucket}/feature-store/"
    }
  }

  feature_definition { feature_name = "user_id"         feature_type = "String" }
  feature_definition { feature_name = "event_time"      feature_type = "String" }
  feature_definition { feature_name = "session_count"   feature_type = "Integral" }
  feature_definition { feature_name = "event_count"     feature_type = "Integral" }
  feature_definition { feature_name = "days_active"     feature_type = "Integral" }
  feature_definition { feature_name = "avg_session_sec" feature_type = "Fractional" }
  feature_definition { feature_name = "churn_score"     feature_type = "Fractional" }
  feature_definition { feature_name = "ltv_score"       feature_type = "Fractional" }
}

output "endpoint_name"   { value = aws_sagemaker_endpoint.main.name }
output "endpoint_arn"    { value = aws_sagemaker_endpoint.main.arn }
output "feature_group"   { value = aws_sagemaker_feature_group.user_features.name }
