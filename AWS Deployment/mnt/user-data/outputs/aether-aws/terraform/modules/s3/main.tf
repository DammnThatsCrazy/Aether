# ═══════════════════════════════════════════════════════════════════════════
# Aether S3 Module — Data Lake, CDN, Event Store
# Intelligent Tiering, Parquet format, partitioned by tenant/date
# Cross-region replication to DR region, versioning enabled
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "dr_region" { type = string default = "us-west-2" }
variable "enable_replication" { type = bool default = false }

# ── Data Lake (event store — Athena queries) ──────────────────────────

resource "aws_s3_bucket" "data_lake" {
  bucket = "aether-data-lake-${var.environment}"
  tags   = { Name = "aether-data-lake-${var.environment}", DataClass = "event-store" }
}

resource "aws_s3_bucket_versioning" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_intelligent_tiering_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  name   = "entire-bucket"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }
  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id

  rule {
    id     = "transition-old-data"
    status = "Enabled"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = var.environment == "production" ? 2555 : 365  # 7 years prod, 1 year others
    }
  }
}

# ── SDK CDN Origin Bucket ─────────────────────────────────────────────

resource "aws_s3_bucket" "cdn" {
  bucket = "aether-cdn-${var.environment}"
  tags   = { Name = "aether-cdn-${var.environment}", DataClass = "static-assets" }
}

resource "aws_s3_bucket_versioning" "cdn" {
  bucket = aws_s3_bucket.cdn.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_public_access_block" "cdn" {
  bucket                  = aws_s3_bucket.cdn.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Dashboard SPA Bucket ──────────────────────────────────────────────

resource "aws_s3_bucket" "dashboard" {
  bucket = "aether-dashboard-${var.environment}"
  tags   = { Name = "aether-dashboard-${var.environment}", DataClass = "static-assets" }
}

resource "aws_s3_bucket_website_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }  # SPA client-side routing
}

# ── ML Artifacts Bucket ───────────────────────────────────────────────

resource "aws_s3_bucket" "ml_artifacts" {
  bucket = "aether-ml-artifacts-${var.environment}"
  tags   = { Name = "aether-ml-artifacts-${var.environment}", DataClass = "ml-models" }
}

resource "aws_s3_bucket_versioning" "ml_artifacts" {
  bucket = aws_s3_bucket.ml_artifacts.id
  versioning_configuration { status = "Enabled" }
}

# ── Athena Query Results ──────────────────────────────────────────────

resource "aws_s3_bucket" "athena_results" {
  bucket = "aether-athena-results-${var.environment}"
  tags   = { Name = "aether-athena-results-${var.environment}" }
}

resource "aws_s3_bucket_lifecycle_configuration" "athena_results" {
  bucket = aws_s3_bucket.athena_results.id
  rule {
    id     = "expire-query-results"
    status = "Enabled"
    expiration { days = 7 }
  }
}

# ── Athena Workgroup ──────────────────────────────────────────────────

resource "aws_athena_workgroup" "main" {
  name = "aether-${var.environment}"
  configuration {
    result_configuration {
      output_location = "s3://${aws_s3_bucket.athena_results.bucket}/results/"
      encryption_configuration { encryption_option = "SSE_KMS" }
    }
    enforce_workgroup_configuration = true
  }
}

# ── Glue Catalog Database (for Athena) ────────────────────────────────

resource "aws_glue_catalog_database" "events" {
  name = "aether_events_${var.environment}"
}

# ── Outputs ───────────────────────────────────────────────────────────

output "data_lake_bucket"    { value = aws_s3_bucket.data_lake.id }
output "data_lake_arn"       { value = aws_s3_bucket.data_lake.arn }
output "cdn_bucket"          { value = aws_s3_bucket.cdn.id }
output "cdn_bucket_arn"      { value = aws_s3_bucket.cdn.arn }
output "dashboard_bucket"    { value = aws_s3_bucket.dashboard.id }
output "ml_artifacts_bucket" { value = aws_s3_bucket.ml_artifacts.id }
