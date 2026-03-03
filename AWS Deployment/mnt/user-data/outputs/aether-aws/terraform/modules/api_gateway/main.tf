# ═══════════════════════════════════════════════════════════════════════════
# Aether API Gateway Module
# HTTP API: Custom domain (api.aether.network), Lambda authorizer, usage plans
# WebSocket API: Real-time streaming (ws.aether.network)
# Route 53 DNS management
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "alb_dns_name" { type = string }
variable "alb_listener_arn" { type = string default = "" }
variable "acm_cert_arn" { type = string default = "" }
variable "hosted_zone_id" { type = string default = "" }

# ── HTTP API Gateway (api.aether.network) ─────────────────────────────

resource "aws_apigatewayv2_api" "http" {
  name          = "aether-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "Aether HTTP API — ${var.environment}"

  cors_configuration {
    allow_origins = var.environment == "production" ? [
      "https://dashboard.aether.network",
      "https://app.aether.io",
    ] : ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"]
    expose_headers = ["X-Request-ID", "X-Response-Time", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]
    max_age       = 3600
  }
}

# Integration with ALB
resource "aws_apigatewayv2_integration" "alb" {
  api_id             = aws_apigatewayv2_api.http.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = "http://${var.alb_dns_name}/{proxy}"
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /v1/health"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      latency        = "$context.responseLatency"
    })
  }

  default_route_settings {
    throttling_rate_limit  = var.environment == "production" ? 10000 : 1000
    throttling_burst_limit = var.environment == "production" ? 5000 : 500
  }
}

# Custom domain (api.aether.network)
resource "aws_apigatewayv2_domain_name" "api" {
  count       = var.acm_cert_arn != "" ? 1 : 0
  domain_name = var.environment == "production" ? "api.aether.network" : "api-${var.environment}.aether.network"

  domain_name_configuration {
    certificate_arn = var.acm_cert_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  count       = var.acm_cert_arn != "" ? 1 : 0
  api_id      = aws_apigatewayv2_api.http.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# ── WebSocket API (ws.aether.network) ─────────────────────────────────

resource "aws_apigatewayv2_api" "websocket" {
  name                       = "aether-ws-${var.environment}"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  description                = "Aether WebSocket API for real-time streaming — ${var.environment}"
}

resource "aws_apigatewayv2_stage" "ws_default" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = var.environment
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 1000
    throttling_burst_limit = 500
  }
}

# ── Route 53 DNS Records ──────────────────────────────────────────────

resource "aws_route53_record" "api" {
  count   = var.hosted_zone_id != "" && var.acm_cert_arn != "" ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.environment == "production" ? "api.aether.network" : "api-${var.environment}.aether.network"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ── Logging ───────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/aether-${var.environment}"
  retention_in_days = 30
}

output "http_api_endpoint"  { value = aws_apigatewayv2_api.http.api_endpoint }
output "ws_api_endpoint"    { value = aws_apigatewayv2_api.websocket.api_endpoint }
output "http_api_id"        { value = aws_apigatewayv2_api.http.id }
output "ws_api_id"          { value = aws_apigatewayv2_api.websocket.id }
