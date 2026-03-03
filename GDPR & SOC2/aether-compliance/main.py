"""
Aether GDPR Compliance & SOC 2 Readiness — Demo Runner
Exercises the full compliance framework: data protection, DSR, consent,
breach notification, ROPA, cross-border transfers, SOC 2 trust criteria,
gap analysis, continuous compliance, audit, access review, and policies.

Run:  python main.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from config.compliance_config import (
    GDPR_RIGHTS, DATA_PROTECTION_CONTROLS, CONSENT_CONFIG,
    GDPR_DATA_STORES, SOC2_TRUST_CRITERIA, AUDIT_TRAILS, BREACH_CONFIG,
    PROCESSING_ACTIVITIES, CROSS_BORDER_TRANSFERS,
    ConsentPurpose, DataRole,
)
from gdpr.data_protection.data_protection import (
    IPAnonymizer, DataVectorizer, Pseudonymizer,
    DataMinimizer, DataMinimizationConfig, DataCategory,
    DataProtectionPipeline, anonymize_ip, verify_encryption, verify_access_controls,
)
from gdpr.data_subject_rights.dsr_engine import DSRExecutor, DSRRequest, DSRType
from gdpr.consent.consent_manager import ConsentManager, ConsentSource
from gdpr.breach_notification.breach_handler import BreachHandler, BreachSeverity
from gdpr.ropa.ropa_engine import ROPAEngine
from soc2.trust_criteria.trust_criteria_engine import TrustCriteriaEngine, ControlStatus
from soc2.gap_analysis.gap_analyzer import GapAnalyzer
from soc2.continuous.compliance_monitor import ContinuousComplianceMonitor
from audit.trails.audit_engine import AuditEngine, AuditAction
from audit.reviews.access_review import AccessReviewer
from policies.policy_generator import PolicyGenerator
from tests.compliance_tests import ComplianceTestRunner


def header(title: str):
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def main():
    header("AETHER COMPLIANCE FRAMEWORK — FULL DEMO")
    print("  Aether operates as a Data Processor on behalf of Customers (Data Controllers)")
    print("  who are responsible for obtaining end-user consent and providing privacy notices.")
    print()
    print("  Framework:")
    print("    GDPR — 7 data protection controls, 6 data subject rights, consent management,")
    print("           breach notification, ROPA (Art. 30), cross-border transfers (Ch. V)")
    print("    SOC 2 — 5 trust criteria, 34 controls, gap analysis, continuous monitoring")
    print("    Audit — 5 trail types, quarterly access reviews, evidence automation")
    print("    Policy — 6 policy documents (security, classification, IR, DPA, PIA, retention)")

    # ═══════════════════════════════════════════════════════════════════
    # 1. GDPR DATA PROTECTION BY DESIGN (Art. 25)
    # ═══════════════════════════════════════════════════════════════════

    header("1. GDPR — DATA PROTECTION BY DESIGN (Article 25)")

    print("  7 Technical Controls:")
    for ctrl in DATA_PROTECTION_CONTROLS:
        print(f"    + {ctrl.name:22s} — {ctrl.description}")
        print(f"      Implementation: {ctrl.technical_implementation}")
    print()

    # Demo: IP Anonymization
    print("  IP Anonymization Demo:")
    for ip in ["192.168.1.100", "10.0.255.42", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"]:
        print(f"    {ip:50s} -> {anonymize_ip(ip)}")
    print()

    # Demo: Pseudonymization
    p = Pseudonymizer("demo-tenant-salt")
    print("  Pseudonymization Demo (SHA-256 + per-tenant salt):")
    for ident in ["user@example.com", "0x1234abcd", "+1-555-0100"]:
        print(f"    {ident:30s} -> {p.pseudonymize(ident)[:32]}...")
    print()

    # Demo: Data Minimization
    config = DataMinimizationConfig("demo-tenant", {DataCategory.PAGE_VIEWS, DataCategory.CUSTOM_EVENTS})
    minimizer = DataMinimizer(config)
    events = [
        {"event_type": "page_view", "url": "/pricing"},
        {"event_type": "click", "element": "cta-button"},
        {"event_type": "custom", "name": "signup_complete"},
        {"event_type": "scroll", "depth": 75},
    ]
    filtered = minimizer.filter_batch(events)
    print(f"  Data Minimization Demo:")
    print(f"    Enabled categories: {[c.value for c in config.enabled_categories]}")
    print(f"    Input events: {len(events)} -> Passed: {len(filtered)}, Blocked: {len(events) - len(filtered)}")
    print()

    # Demo: Encryption
    print("  Encryption Verification:")
    for status in verify_encryption():
        print(f"    + {status.component:25s} Transit: {status.in_transit:8s}  Rest: {status.at_rest}")
    print()

    # Demo: Full pipeline
    pipeline = DataProtectionPipeline(
        ip_anonymizer=IPAnonymizer(),
        vectorizer=DataVectorizer(enabled=False),
        pseudonymizer=Pseudonymizer("demo-salt"),
        minimizer=minimizer,
    )
    processed = pipeline.process_batch([
        {"event_type": "page_view", "url": "/home", "ip": "1.2.3.4", "user_id": "user-1"},
        {"event_type": "click", "element": "btn", "ip": "5.6.7.8", "user_id": "user-2"},
        {"event_type": "custom", "name": "checkout", "ip": "9.10.11.12", "user_id": "user-3"},
    ])
    print(f"  Full Data Protection Pipeline:")
    print(f"    Input: 3 events -> Output: {len(processed)} (after minimization + anonymization + pseudonymization)")
    print(f"    Stats: {pipeline.stats}")
    print(f"    Lineage: {pipeline.lineage.stats}")

    # ═══════════════════════════════════════════════════════════════════
    # 2. GDPR DATA SUBJECT RIGHTS (Articles 15-21)
    # ═══════════════════════════════════════════════════════════════════

    header("2. GDPR — DATA SUBJECT RIGHTS (Articles 15-21)")

    print("  6 Implemented Rights:")
    for right in GDPR_RIGHTS:
        imm = " [IMMEDIATE]" if right.immediate else ""
        print(f"    {right.article:10s} {right.name:25s} SLA: {right.sla}{imm}")
        print(f"               API: {right.api_endpoint}")
    print()

    print("  Data Stores Requiring GDPR Compliance:")
    for store in GDPR_DATA_STORES:
        print(f"    {store.name:30s} -> {store.deletion_method}")
    print()

    # Demo: Execute all DSR types
    executor = DSRExecutor()
    for dsr_type in DSRType:
        dsr = DSRRequest(type=dsr_type, tenant_id="demo-tenant", user_id="demo-user-001")
        executor.submit(dsr)
        executor.execute(dsr.id)
        print()

    summary = executor.summary()
    print(f"  DSR Summary: {summary['total']} requests processed — {summary['by_status']}")

    # ═══════════════════════════════════════════════════════════════════
    # 3. CONSENT MANAGEMENT
    # ═══════════════════════════════════════════════════════════════════

    header("3. GDPR — CONSENT MANAGEMENT")

    print(f"  Configuration:")
    print(f"    Purposes: {CONSENT_CONFIG.purposes}")
    print(f"    Storage: {CONSENT_CONFIG.storage}")
    print(f"    DNT Respected: {CONSENT_CONFIG.dnt_respected}")
    print(f"    Withdrawal Effect: {CONSENT_CONFIG.withdrawal_effect}")
    print(f"    SDK Enforcement: {CONSENT_CONFIG.sdk_enforcement}")
    print(f"    Audit Fields: {CONSENT_CONFIG.audit_fields}")
    print()

    mgr = ConsentManager()

    mgr.grant("tenant-1", "user-A", ConsentPurpose.ANALYTICS, "2.1", ConsentSource.BANNER, "1.2.3.4", "Chrome/120")
    mgr.grant("tenant-1", "user-A", ConsentPurpose.MARKETING, "2.1", ConsentSource.BANNER)
    mgr.grant("tenant-1", "user-B", ConsentPurpose.ANALYTICS, "2.1", ConsentSource.BANNER)
    mgr.revoke("tenant-1", "user-A", ConsentPurpose.MARKETING, ConsentSource.SETTINGS)
    mgr.handle_dnt("tenant-1", "user-C", "1")

    for uid in ["user-A", "user-B", "user-C"]:
        state = mgr.get_state("tenant-1", uid)
        print(f"  {uid}: {state.purposes}")

    print(f"\n  Audit Trail for user-A: {len(mgr.get_audit_trail('tenant-1', 'user-A'))} records")
    print(f"  Stats: {mgr.stats}")
    print(f"  Tenant Report: {mgr.consent_report('tenant-1')}")

    # ═══════════════════════════════════════════════════════════════════
    # 4. BREACH NOTIFICATION (Article 33)
    # ═══════════════════════════════════════════════════════════════════

    header("4. GDPR — BREACH NOTIFICATION (Article 33/34)")

    print(f"  Configuration:")
    print(f"    Notification window: {BREACH_CONFIG.notification_window_hours} hours")
    print(f"    Internal escalation: {BREACH_CONFIG.internal_escalation_minutes} minutes")
    print(f"    Channels: {', '.join(BREACH_CONFIG.channels)}")
    print()

    handler = BreachHandler()
    incident = handler.run_full_response(
        description="Unauthorized API access detected via compromised API key",
        detection_source="GuardDuty anomaly detection",
        severity=BreachSeverity.HIGH,
        users_count=2500,
        data_categories=["identity_profiles", "behavioral_events"],
    )

    print(f"\n  Incident Summary: {incident.to_dict()}")

    # ═══════════════════════════════════════════════════════════════════
    # 5. RECORD OF PROCESSING ACTIVITIES — ROPA (Article 30)  [NEW]
    # ═══════════════════════════════════════════════════════════════════

    header("5. GDPR — RECORD OF PROCESSING ACTIVITIES (Article 30)")

    ropa = ROPAEngine()
    ropa.print_register()
    ropa.print_transfer_report()

    print(f"  ROPA Summary: {ropa.summary}")
    dpia_pending = ropa.dpia_required_activities()
    if dpia_pending:
        print(f"  DPIA Required: {[a.name for a in dpia_pending]}")

    # ═══════════════════════════════════════════════════════════════════
    # 6. SOC 2 TRUST CRITERIA ASSESSMENT
    # ═══════════════════════════════════════════════════════════════════

    header("6. SOC 2 TYPE II — TRUST CRITERIA ASSESSMENT")

    engine = TrustCriteriaEngine()
    assessments = engine.run_full_assessment()

    print(f"  {'Criteria':<25s} {'Controls':>9s} {'Implemented':>12s} {'Partial':>8s} {'Missing':>8s} {'Coverage':>9s}")
    print(f"  {'—' * 25} {'—' * 9} {'—' * 12} {'—' * 8} {'—' * 8} {'—' * 9}")
    for a in assessments:
        print(f"  {a.name:<25s} {a.total_controls:>9d} {a.implemented:>12d} {a.partial:>8d} {a.not_implemented:>8d} {a.coverage_pct:>8.1f}%")

    readiness = engine.overall_readiness()
    print(f"\n  Overall: {readiness['readiness_score']}% ready ({readiness['implemented']}/{readiness['total_controls']} implemented)")
    print(f"  Certification Ready: {'YES' if readiness['certification_ready'] else 'NO — gaps remain'}")

    for a in assessments:
        print(f"\n  -- {a.name} ({a.coverage_pct}%) --")
        for ctrl in a.controls:
            icon = {"implemented": "+", "partially_implemented": "~", "not_implemented": "x"}[ctrl.status.value]
            print(f"    {icon} [{ctrl.id}] {ctrl.name}")
            if ctrl.notes:
                print(f"                 {ctrl.notes}")

    # ═══════════════════════════════════════════════════════════════════
    # 7. GAP ANALYSIS & REMEDIATION PLAN
    # ═══════════════════════════════════════════════════════════════════

    header("7. SOC 2 — GAP ANALYSIS & REMEDIATION PLAN")

    analyzer = GapAnalyzer(engine)
    analyzer.print_gap_report()

    timeline = analyzer.remediation_timeline()
    print("  Remediation Timeline:")
    for phase in timeline:
        print(f"    Phase {phase['phase']}: {phase['name']} — {', '.join(phase['items']) if phase['items'] else 'None'}")

    # ═══════════════════════════════════════════════════════════════════
    # 8. CONTINUOUS COMPLIANCE MONITORING  [NEW]
    # ═══════════════════════════════════════════════════════════════════

    header("8. SOC 2 — CONTINUOUS COMPLIANCE MONITORING")

    monitor = ContinuousComplianceMonitor()
    monitor.run_all_checks()
    monitor.print_report()
    print(f"\n  Compliance Score: {monitor.compliance_score}%")
    print(f"  Monitor Summary: {monitor.summary}")

    # ═══════════════════════════════════════════════════════════════════
    # 9. AUDIT INFRASTRUCTURE
    # ═══════════════════════════════════════════════════════════════════

    header("9. AUDIT INFRASTRUCTURE")

    print("  5 Audit Trail Types:")
    for trail in AUDIT_TRAILS:
        years = trail.retention_days / 365
        print(f"    + {trail.name:22s} | {trail.retention_days:>5d}d ({years:.0f}y) | {trail.storage:20s} | {trail.description}")
    print()

    audit = AuditEngine()
    audit.log_data_access("admin-1", "t1", "profile", "user-1", AuditAction.READ)
    audit.log_data_access("admin-1", "t1", "profile", "user-2", AuditAction.UPDATE, {"field": "email"})
    audit.log_data_access("system", "t1", "profile", "user-3", AuditAction.DELETE, {"reason": "GDPR erasure"})
    audit.log_consent_event("t1", "user-1", AuditAction.CONSENT_GRANT, "analytics", "2.1")
    audit.log_consent_event("t1", "user-1", AuditAction.CONSENT_REVOKE, "marketing")
    audit.log_dsr("t1", "user-1", "access", "dsr_001")
    audit.log_dsr("t1", "user-2", "erasure", "dsr_002")
    audit.log_agent_action("t1", "agent-1", "task-001", "churn_predict", {"user_id": "u1"}, {"score": 0.82}, 0.95, "churn-xgb-v3")
    audit.log_agent_action("t1", "agent-2", "task-002", "journey_predict", {"session": "s1"}, {"next": "checkout"}, 0.88, "journey-tft-v2")
    audit.log_access_review("security-lead", "2025-Q4",
                            [{"type": "unused_account", "count": 2}],
                            ["Disabled 2 inactive accounts"])

    print(f"  Audit Summary: {audit.summary()}")
    audit.verify_trails()

    # ═══════════════════════════════════════════════════════════════════
    # 10. QUARTERLY ACCESS REVIEW
    # ═══════════════════════════════════════════════════════════════════

    header("10. QUARTERLY IAM ACCESS REVIEW")

    reviewer = AccessReviewer()
    report = reviewer.run_review("2025-Q4", "security-lead")

    # ═══════════════════════════════════════════════════════════════════
    # 11. POLICY DOCUMENTS
    # ═══════════════════════════════════════════════════════════════════

    header("11. POLICY DOCUMENTS")

    gen = PolicyGenerator()
    policies = gen.generate_all()

    print(f"\n  6 Policy Documents Generated:")
    for pol in policies:
        print(f"    {pol.status:8s} {pol.title} ({pol.section_count} sections, owner: {pol.owner})")

    # ═══════════════════════════════════════════════════════════════════
    # 12. COMPLIANCE TEST SUITE
    # ═══════════════════════════════════════════════════════════════════

    header("12. COMPLIANCE TEST SUITE")

    runner = ComplianceTestRunner()
    results = runner.run_all()

    # ═══════════════════════════════════════════════════════════════════
    # FINAL SUMMARY
    # ═══════════════════════════════════════════════════════════════════

    header("COMPLIANCE FRAMEWORK SUMMARY")
    print("  -- GDPR --")
    print("  + 7 Data Protection Controls   — IP anonymization, vectorization, pseudonymization, minimization, encryption, access")
    print("  + 6 Data Subject Rights         — Art. 15-21 with cascading deletion across 7 stores")
    print("  + 3 Consent Purposes            — analytics, marketing, web3 (independent, audited, DNT-aware)")
    print("  + 72h Breach Notification        — 8-step incident response pipeline (Art. 33/34)")
    print(f"  + {len(PROCESSING_ACTIVITIES)} Processing Activities     — ROPA register with legal basis and recipients (Art. 30)")
    print(f"  + {len(CROSS_BORDER_TRANSFERS)} Cross-Border Transfers    — SCCs + TIA for each transfer (Ch. V)")
    print("  + 7 Data Stores Mapped           — Deletion methods and retention per store")
    print()
    print("  -- SOC 2 Type II --")
    print(f"  + 5 Trust Criteria Assessed     — {readiness['readiness_score']}% readiness score")
    print(f"  + {readiness['total_controls']} Controls Defined           — {readiness['implemented']} implemented, {readiness['partially_implemented']} partial, {readiness['not_implemented']} gaps")
    gaps = analyzer.analyze()
    print(f"  + {len(gaps)} Gaps with Remediation Plans — prioritized P0-P3 with owners and timelines")
    print(f"  + Continuous Monitoring          — {monitor.compliance_score}% compliance score ({monitor.summary['total_checks']} automated checks)")
    print()
    print("  -- Audit --")
    print("  + 5 Audit Trail Types           — CloudTrail, application, consent (7yr), agent, access reviews")
    print("  + Quarterly Access Reviews       — IAM users, roles, service accounts")
    print()
    print("  -- Policies --")
    print(f"  + {len(policies)} Policy Documents           — Security, classification, incident response, DPA, PIA, retention")
    print()
    passed = sum(1 for r in results if r.passed)
    print(f"  -- Tests: {passed}/{len(results)} compliance checks passed --")
    print()


if __name__ == "__main__":
    main()
