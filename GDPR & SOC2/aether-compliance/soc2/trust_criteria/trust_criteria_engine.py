"""
Aether SOC 2 Type II — Trust Service Criteria Assessment Engine
Evaluates all 5 Trust Service Criteria against current implementation.

Trust Criteria:
  CC — Security:              Encryption, RBAC, WAF, GuardDuty, VPC isolation
  A  — Availability:          Multi-AZ, auto-scaling, DR plan, 99.9% SLA
  PI — Processing Integrity:  Schema validation, idempotency, event sourcing
  C  — Confidentiality:       Encryption, DPA, access controls, sub-processors
  P  — Privacy:               GDPR framework, consent, data minimization, retention
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ControlStatus(str, Enum):
    IMPLEMENTED = "implemented"
    PARTIALLY_IMPLEMENTED = "partially_implemented"
    NOT_IMPLEMENTED = "not_implemented"
    COMPENSATING = "compensating"


class EvidenceType(str, Enum):
    CONFIGURATION = "configuration"
    LOG = "log"
    POLICY = "policy"
    REPORT = "report"
    TEST_RESULT = "test_result"
    INTERVIEW = "interview"


@dataclass
class SOC2Control:
    """A single SOC 2 control point."""
    id: str
    criteria: str
    name: str
    description: str
    status: ControlStatus = ControlStatus.NOT_IMPLEMENTED
    implementation_detail: str = ""
    evidence: list = field(default_factory=list)
    test_result: Optional[str] = None
    test_date: Optional[str] = None
    owner: str = ""
    notes: str = ""

    @property
    def passed(self) -> bool:
        return self.status in (ControlStatus.IMPLEMENTED, ControlStatus.COMPENSATING)


@dataclass
class CriteriaAssessment:
    """Assessment result for one trust criteria."""
    criteria: str
    name: str
    total_controls: int = 0
    implemented: int = 0
    partial: int = 0
    not_implemented: int = 0
    coverage_pct: float = 0.0
    controls: list = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# SOC 2 CONTROL DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

def _build_controls() -> list:
    """Define all SOC 2 controls mapped to Aether's implementation."""

    controls = [
        # ── CC: SECURITY ─────────────────────────────────────────────
        SOC2Control("CC-1.1", "Security", "Encryption in Transit",
                    "All data encrypted in transit using TLS 1.3",
                    ControlStatus.IMPLEMENTED,
                    "TLS 1.3 enforced on ALB, API Gateway, inter-service communication",
                    [{"type": "configuration", "source": "ALB listener policy", "verified": True}]),
        SOC2Control("CC-1.2", "Security", "Encryption at Rest",
                    "All data stores encrypted at rest with AES-256 via KMS",
                    ControlStatus.IMPLEMENTED,
                    "RDS, Neptune, ElastiCache, S3, DynamoDB, OpenSearch — all KMS encrypted",
                    [{"type": "configuration", "source": "Terraform module configs", "verified": True}]),
        SOC2Control("CC-2.1", "Security", "Role-Based Access Control",
                    "RBAC with principle of least privilege across all services",
                    ControlStatus.IMPLEMENTED,
                    "4 roles (admin, editor, viewer, service), 10 granular permissions, JWT + API key auth",
                    [{"type": "configuration", "source": "Auth middleware config", "verified": True}]),
        SOC2Control("CC-2.2", "Security", "Network Security",
                    "VPC isolation, security groups, WAF",
                    ControlStatus.IMPLEMENTED,
                    "VPC per environment, private subnets for data stores, WAF with rate limiting + bot control",
                    [{"type": "configuration", "source": "VPC/WAF Terraform modules", "verified": True}]),
        SOC2Control("CC-2.3", "Security", "Threat Detection",
                    "Automated threat detection and response",
                    ControlStatus.IMPLEMENTED,
                    "GuardDuty enabled, Security Hub for compliance scoring, CloudTrail for audit",
                    [{"type": "configuration", "source": "IAM Terraform module", "verified": True}]),
        SOC2Control("CC-2.4", "Security", "Secrets Management",
                    "Credentials stored in dedicated secrets manager",
                    ControlStatus.IMPLEMENTED,
                    "AWS Secrets Manager for all credentials, no hardcoded secrets",
                    [{"type": "configuration", "source": "Secrets Manager config", "verified": True}]),
        SOC2Control("CC-3.1", "Security", "Security Policy Documentation",
                    "Formal security policy covering all aspects",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Security Team",
                    "GAP: Requires formal written security policy document"),
        SOC2Control("CC-3.2", "Security", "Penetration Testing",
                    "Regular penetration testing by qualified third party",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Security Team",
                    "GAP: Requires engagement with pen-test vendor"),
        SOC2Control("CC-4.1", "Security", "Vulnerability Management",
                    "Regular vulnerability scanning and remediation",
                    ControlStatus.IMPLEMENTED,
                    "Snyk (dependencies), CodeQL (SAST), Trivy (containers), GitLeaks (secrets) in CI pipeline",
                    [{"type": "test_result", "source": "CI pipeline security stage", "verified": True}]),
        SOC2Control("CC-5.1", "Security", "Incident Response Plan",
                    "Documented incident response procedure",
                    ControlStatus.PARTIALLY_IMPLEMENTED,
                    "Breach notification handler coded, but formal plan document needed",
                    [{"type": "configuration", "source": "breach_handler.py", "verified": True}],
                    notes="Partial: code exists, written policy needed"),

        # ── A: AVAILABILITY ──────────────────────────────────────────
        SOC2Control("A-1.1", "Availability", "Multi-AZ Deployment",
                    "Services deployed across multiple availability zones",
                    ControlStatus.IMPLEMENTED,
                    "3 AZs, all data stores Multi-AZ, ALB distributes across zones",
                    [{"type": "configuration", "source": "VPC/ECS Terraform modules", "verified": True}]),
        SOC2Control("A-1.2", "Availability", "Auto-Scaling",
                    "Automatic scaling based on demand",
                    ControlStatus.IMPLEMENTED,
                    "ECS autoscaling on CPU, SageMaker on invocations, scale-out cooldown 60s",
                    [{"type": "configuration", "source": "ECS module autoscaling", "verified": True}]),
        SOC2Control("A-1.3", "Availability", "Health Monitoring",
                    "Continuous health checks with automatic recovery",
                    ControlStatus.IMPLEMENTED,
                    "/v1/health endpoints, ALB health checks, ECS circuit breaker rollback",
                    [{"type": "configuration", "source": "ECS/monitoring modules", "verified": True}]),
        SOC2Control("A-2.1", "Availability", "Disaster Recovery Plan",
                    "Documented DR plan with RPO/RTO targets",
                    ControlStatus.IMPLEMENTED,
                    "RPO 1h, RTO 4h, cross-region replication, Terraform rebuild within 2h",
                    [{"type": "configuration", "source": "disaster_recovery.py", "verified": True}]),
        SOC2Control("A-2.2", "Availability", "Backup and Restore",
                    "Automated backups with tested restore procedures",
                    ControlStatus.IMPLEMENTED,
                    "RDS 35-day snapshots, Neptune continuous backup, S3 CRR, Redis daily snapshots",
                    [{"type": "configuration", "source": "Data store Terraform modules", "verified": True}]),
        SOC2Control("A-3.1", "Availability", "Formal SLA Documentation",
                    "Documented availability SLA for customers",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Product/Legal",
                    "GAP: 99.9% target exists but needs formal SLA document"),
        SOC2Control("A-3.2", "Availability", "Tabletop Exercises",
                    "Regular incident response tabletop exercises",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Engineering/Security",
                    "GAP: DR code exists but tabletop exercises not conducted"),

        # ── PI: PROCESSING INTEGRITY ─────────────────────────────────
        SOC2Control("PI-1.1", "Processing Integrity", "Input Validation",
                    "Schema validation on all inputs",
                    ControlStatus.IMPLEMENTED,
                    "Pydantic models for all API inputs, strict type checking",
                    [{"type": "configuration", "source": "Backend API validators", "verified": True}]),
        SOC2Control("PI-1.2", "Processing Integrity", "Idempotent Processing",
                    "Deduplication and idempotency guarantees",
                    ControlStatus.IMPLEMENTED,
                    "Event deduplication via Redis SETNX, idempotency keys on all write operations",
                    [{"type": "configuration", "source": "Ingestion service middleware", "verified": True}]),
        SOC2Control("PI-1.3", "Processing Integrity", "Event Sourcing",
                    "Immutable event log for full audit trail",
                    ControlStatus.IMPLEMENTED,
                    "TimescaleDB hypertable + S3 data lake (Parquet), append-only",
                    [{"type": "configuration", "source": "Analytics service", "verified": True}]),
        SOC2Control("PI-1.4", "Processing Integrity", "Data Quality",
                    "Data quality scoring in ML pipeline",
                    ControlStatus.IMPLEMENTED,
                    "Schema validation, completeness scoring, anomaly detection on ingested events",
                    [{"type": "configuration", "source": "ML pipeline", "verified": True}]),
        SOC2Control("PI-2.1", "Processing Integrity", "Controls Documentation",
                    "Formal processing integrity controls documentation",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Engineering",
                    "GAP: Controls exist in code, need formal document"),

        # ── C: CONFIDENTIALITY ───────────────────────────────────────
        SOC2Control("C-1.1", "Confidentiality", "Data Encryption",
                    "Encryption of confidential data at rest and in transit",
                    ControlStatus.IMPLEMENTED,
                    "TLS 1.3 transit, AES-256 at rest for all stores",
                    [{"type": "configuration", "source": "All Terraform modules", "verified": True}]),
        SOC2Control("C-1.2", "Confidentiality", "Access Controls",
                    "Access restricted to authorized personnel",
                    ControlStatus.IMPLEMENTED,
                    "RBAC, API keys, JWT auth, tenant isolation, service-to-service auth",
                    [{"type": "configuration", "source": "Auth middleware", "verified": True}]),
        SOC2Control("C-1.3", "Confidentiality", "DPA Template",
                    "Data Processing Agreement for customers",
                    ControlStatus.PARTIALLY_IMPLEMENTED,
                    "DPA template exists in draft form",
                    [], None, None, "Legal",
                    "Partial: template drafted, needs legal review"),
        SOC2Control("C-1.4", "Confidentiality", "Sub-Processor List",
                    "Maintained list of sub-processors",
                    ControlStatus.PARTIALLY_IMPLEMENTED,
                    "AWS listed as primary sub-processor",
                    [], None, None, "Legal",
                    "Partial: AWS listed, need complete sub-processor register"),
        SOC2Control("C-2.1", "Confidentiality", "Data Classification",
                    "Formal data classification policy",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Security/Legal",
                    "GAP: Requires formal classification scheme document"),
        SOC2Control("C-2.2", "Confidentiality", "Access Review Process",
                    "Quarterly access reviews with documented outcomes",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Security",
                    "GAP: Requires quarterly review process and tooling"),

        # ── P: PRIVACY ───────────────────────────────────────────────
        SOC2Control("P-1.1", "Privacy", "GDPR Framework",
                    "Comprehensive GDPR compliance framework",
                    ControlStatus.IMPLEMENTED,
                    "Data protection by design, 7 controls, DSR engine (Art. 15-21)",
                    [{"type": "configuration", "source": "GDPR compliance modules", "verified": True}]),
        SOC2Control("P-1.2", "Privacy", "Consent Management",
                    "Purpose-based consent with audit trail",
                    ControlStatus.IMPLEMENTED,
                    "3 purposes, immutable DynamoDB audit trail, DNT support, SDK enforcement",
                    [{"type": "configuration", "source": "Consent manager", "verified": True}]),
        SOC2Control("P-1.3", "Privacy", "Data Minimization",
                    "Collection limited to necessary data",
                    ControlStatus.IMPLEMENTED,
                    "SDK only collects enabled categories, no shadow collection",
                    [{"type": "configuration", "source": "Data minimization module", "verified": True}]),
        SOC2Control("P-1.4", "Privacy", "Retention Policies",
                    "Defined retention periods per data store",
                    ControlStatus.IMPLEMENTED,
                    "S3 lifecycle rules, log retention 30d, backup retention 35d, data lake per-tenant",
                    [{"type": "configuration", "source": "S3/monitoring Terraform modules", "verified": True}]),
        SOC2Control("P-2.1", "Privacy", "Privacy Impact Assessment",
                    "PIA template and process",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Privacy/Legal",
                    "GAP: Requires PIA template for new features/data processing"),
        SOC2Control("P-2.2", "Privacy", "Annual Privacy Review",
                    "Regular privacy review process",
                    ControlStatus.NOT_IMPLEMENTED,
                    "",
                    [], None, None, "Privacy/Legal",
                    "GAP: Requires annual review schedule and checklist"),
    ]

    return controls


# ═══════════════════════════════════════════════════════════════════════════
# ASSESSMENT ENGINE
# ═══════════════════════════════════════════════════════════════════════════

class TrustCriteriaEngine:
    """Runs SOC 2 Type II readiness assessment across all 5 criteria."""

    def __init__(self):
        self.controls = _build_controls()

    def assess_criteria(self, criteria_name: str) -> CriteriaAssessment:
        """Assess a single trust criteria."""
        matching = [c for c in self.controls if c.criteria == criteria_name]
        implemented = sum(1 for c in matching if c.status == ControlStatus.IMPLEMENTED)
        partial = sum(1 for c in matching if c.status == ControlStatus.PARTIALLY_IMPLEMENTED)
        not_impl = sum(1 for c in matching if c.status == ControlStatus.NOT_IMPLEMENTED)
        total = len(matching)
        coverage = ((implemented + partial * 0.5) / total * 100) if total else 0

        criteria_map = {"Security": "CC", "Availability": "A", "Processing Integrity": "PI",
                        "Confidentiality": "C", "Privacy": "P"}
        prefix = criteria_map.get(criteria_name, criteria_name)

        return CriteriaAssessment(
            criteria=prefix, name=criteria_name,
            total_controls=total, implemented=implemented,
            partial=partial, not_implemented=not_impl,
            coverage_pct=round(coverage, 1), controls=matching,
        )

    def run_full_assessment(self) -> list:
        """Run assessment across all 5 trust criteria."""
        criteria_names = ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"]
        return [self.assess_criteria(name) for name in criteria_names]

    def get_gaps(self) -> list:
        """Get all controls that are not fully implemented."""
        return [c for c in self.controls if c.status != ControlStatus.IMPLEMENTED]

    def get_critical_gaps(self) -> list:
        """Get controls that are completely missing."""
        return [c for c in self.controls if c.status == ControlStatus.NOT_IMPLEMENTED]

    def overall_readiness(self) -> dict:
        total = len(self.controls)
        impl = sum(1 for c in self.controls if c.status == ControlStatus.IMPLEMENTED)
        partial = sum(1 for c in self.controls if c.status == ControlStatus.PARTIALLY_IMPLEMENTED)
        not_impl = sum(1 for c in self.controls if c.status == ControlStatus.NOT_IMPLEMENTED)
        score = ((impl + partial * 0.5) / total * 100) if total else 0

        return {
            "total_controls": total,
            "implemented": impl,
            "partially_implemented": partial,
            "not_implemented": not_impl,
            "readiness_score": round(score, 1),
            "certification_ready": not_impl == 0,
        }
