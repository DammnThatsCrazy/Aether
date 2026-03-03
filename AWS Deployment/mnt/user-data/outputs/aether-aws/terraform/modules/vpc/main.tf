# ═══════════════════════════════════════════════════════════════════════════
# Aether VPC Module
# /16 CIDR, 3 AZs, 3 public + 3 private subnets, NAT Gateways, flow logs
# Public: ALB, NAT Gateways, bastion hosts
# Private: ECS tasks, RDS, ElastiCache, Neptune, Lambda
# ═══════════════════════════════════════════════════════════════════════════

variable "environment" { type = string }
variable "aws_region" { type = string default = "us-east-1" }
variable "vpc_cidr" { type = string default = "10.0.0.0/16" }
variable "enable_vpc_peering" { type = bool default = false }
variable "peer_vpc_id" { type = string default = "" }
variable "peer_account_id" { type = string default = "" }

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
  # /20 subnets: 4096 IPs each
  public_cidrs  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 4, i)]
  private_cidrs = [for i in range(3) : cidrsubnet(var.vpc_cidr, 4, i + 3)]
}

# ── VPC ───────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "aether-vpc-${var.environment}" }
}

# ── Internet Gateway ─────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "aether-igw-${var.environment}" }
}

# ── Public Subnets (ALB, NAT Gateways, bastion) ─────────────────────

resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "aether-public-${local.azs[count.index]}-${var.environment}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "aether-public-rt-${var.environment}" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ── NAT Gateways (one per AZ for HA) ─────────────────────────────────

resource "aws_eip" "nat" {
  count  = var.environment == "production" ? 3 : 1
  domain = "vpc"
  tags   = { Name = "aether-nat-eip-${count.index}-${var.environment}" }
}

resource "aws_nat_gateway" "main" {
  count         = var.environment == "production" ? 3 : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = { Name = "aether-nat-${count.index}-${var.environment}" }
}

# ── Private Subnets (ECS, RDS, ElastiCache, Neptune, Lambda) ─────────

resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = { Name = "aether-private-${local.azs[count.index]}-${var.environment}" }
}

resource "aws_route_table" "private" {
  count  = 3
  vpc_id = aws_vpc.main.id
  tags   = { Name = "aether-private-rt-${count.index}-${var.environment}" }
}

resource "aws_route" "private_nat" {
  count                  = 3
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[var.environment == "production" ? count.index : 0].id
}

resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ── VPC Flow Logs ─────────────────────────────────────────────────────

resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination      = aws_cloudwatch_log_group.vpc_flow.arn
  log_destination_type = "cloud-watch-logs"
  iam_role_arn         = aws_iam_role.flow_log.arn
}

resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/aether-${var.environment}/flow-logs"
  retention_in_days = 30
}

resource "aws_iam_role" "flow_log" {
  name = "aether-vpc-flow-log-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "vpc-flow-logs.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "flow_log" {
  role       = aws_iam_role.flow_log.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# ── VPC Peering (production ↔ data account for ML model access) ──────

resource "aws_vpc_peering_connection" "data" {
  count         = var.enable_vpc_peering ? 1 : 0
  vpc_id        = aws_vpc.main.id
  peer_vpc_id   = var.peer_vpc_id
  peer_owner_id = var.peer_account_id
  auto_accept   = false

  tags = { Name = "aether-peer-${var.environment}-to-data" }
}

# ── Outputs ───────────────────────────────────────────────────────────

output "vpc_id"             { value = aws_vpc.main.id }
output "vpc_cidr"           { value = aws_vpc.main.cidr_block }
output "public_subnet_ids"  { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "azs"                { value = local.azs }
