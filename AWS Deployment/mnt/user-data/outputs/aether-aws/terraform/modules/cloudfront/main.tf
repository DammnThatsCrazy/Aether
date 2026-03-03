# ═══════════════════════════════════════════════════════════════════════════
# Aether CloudFront Module
# CDN for SDK delivery (cdn.aether.network) and dashboard SPA
# Origin Access Control, custom domains, WAF integration
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "cdn_bucket_id" { type = string }
variable "cdn_bucket_arn" { type = string }
variable "cdn_bucket_domain" { type = string }
variable "dashboard_bucket_id" { type = string }
variable "dashboard_bucket_domain" { type = string }
variable "waf_acl_arn" { type = string default = "" }
variable "acm_cert_arn" { type = string default = "" }

# ── SDK CDN Distribution (cdn.aether.network) ────────────────────────

resource "aws_cloudfront_origin_access_control" "cdn" {
  name                              = "aether-cdn-oac-${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Aether SDK CDN — ${var.environment}"
  default_root_object = "index.html"
  price_class         = var.environment == "production" ? "PriceClass_All" : "PriceClass_100"
  web_acl_id          = var.waf_acl_arn != "" ? var.waf_acl_arn : null

  aliases = var.environment == "production" ? ["cdn.aether.network"] : []

  origin {
    domain_name              = var.cdn_bucket_domain
    origin_id                = "s3-sdk"
    origin_access_control_id = aws_cloudfront_origin_access_control.cdn.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-sdk"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400    # 24 hours
    max_ttl     = 31536000 # 1 year

    # Versioned SDK paths are immutable — long cache
    # /sdk/latest/ uses shorter cache via cache policy
  }

  # Short cache for /sdk/latest/ path
  ordered_cache_behavior {
    path_pattern           = "/sdk/latest/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-sdk"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 300   # 5 minutes for latest
    max_ttl     = 3600
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_cert_arn == ""
    acm_certificate_arn            = var.acm_cert_arn != "" ? var.acm_cert_arn : null
    ssl_support_method             = var.acm_cert_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = { Name = "aether-cdn-${var.environment}" }
}

# ── Dashboard SPA Distribution (dashboard.aether.network) ────────────

resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "aether-dashboard-oac-${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Aether Dashboard SPA — ${var.environment}"
  default_root_object = "index.html"
  price_class         = var.environment == "production" ? "PriceClass_All" : "PriceClass_100"
  web_acl_id          = var.waf_acl_arn != "" ? var.waf_acl_arn : null

  aliases = var.environment == "production" ? ["dashboard.aether.network"] : []

  origin {
    domain_name              = var.dashboard_bucket_domain
    origin_id                = "s3-dashboard"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-dashboard"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 3600
  }

  # SPA fallback: return index.html for 404s (client-side routing)
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_cert_arn == ""
    acm_certificate_arn            = var.acm_cert_arn != "" ? var.acm_cert_arn : null
    ssl_support_method             = var.acm_cert_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = { Name = "aether-dashboard-${var.environment}" }
}

output "cdn_distribution_id"       { value = aws_cloudfront_distribution.cdn.id }
output "cdn_domain"                { value = aws_cloudfront_distribution.cdn.domain_name }
output "dashboard_distribution_id" { value = aws_cloudfront_distribution.dashboard.id }
output "dashboard_domain"          { value = aws_cloudfront_distribution.dashboard.domain_name }
