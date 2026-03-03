# Aether CI/CD Pipeline

Modular, production-grade CI/CD pipeline for the **Aether platform** -- a monorepo spanning 5 SDK packages, 9 microservices, and shared infrastructure. Built in Python with a clean separation between configuration, quality gates, CI stages, CD stages, and SDK release automation.

---

## Tech Stack

| Layer            | Technology                                                   |
| ---------------- | ------------------------------------------------------------ |
| Language         | Python >= 3.9                                                |
| CI Orchestration | GitHub Actions                                               |
| Containerization | Docker, Amazon ECR, Cosign (image signing)                   |
| Infrastructure   | Terraform (Atlantis for plan review), AWS ECS / S3 / RDS     |
| Monorepo         | Turborepo (remote caching enabled)                           |
| Security         | Snyk, CodeQL, Trivy, GitLeaks, Syft (SBOM)                  |
| Testing          | Jest, pytest, XCTest, JUnit, Playwright, Detox, k6, Artillery |
| Notifications    | Slack, PagerDuty                                             |

---

## Pipeline Overview

The pipeline is divided into **8 CI stages**, **6 CD stages**, a **quality-gate engine**, and an **SDK release system**.

```
  Source Push
      |
      v
 +-----------+     +-----------+     +-----------+     +-----------+
 |   CI      | --> |  Quality  | --> |    CD     | --> | Production|
 |  8 stages |     |   Gates   |     |  6 stages |     |  (100%)   |
 +-----------+     +-----------+     +-----------+     +-----------+
      |                                    |
      |                                    +---> Rollback (automatic)
      |
      +---> SDK Release (npm, PyPI, Maven, CocoaPods)
```

All stages share a single configuration source (`config/pipeline_config.py`) and delegate command execution to shared utilities (`shared/runner.py`).

---

## Architecture

```
aether-cicd/
|-- main.py                     # Demo runner -- exercises full pipeline
|-- config/
|   +-- pipeline_config.py      # Environments, stages, thresholds, SDK targets
|-- quality_gates/
|   +-- gate.py                 # QualityGate engine (pass/fail/warn per stage)
|-- stages/
|   |-- ci/
|   |   +-- ci_stages.py        # 8-stage CI pipeline
|   |-- cd/
|   |   +-- cd_stages.py        # 6-stage progressive CD pipeline
|   +-- sdk/
|       +-- sdk_release.py      # Multi-platform SDK release automation
|-- shared/
|   |-- runner.py               # run_cmd(), log(), timed() -- single subprocess wrapper
|   |-- notifier.py             # Slack / PagerDuty notification dispatch
|   |-- parsers.py              # Output parsers for tool results
|   +-- change_detect.py        # Monorepo change detection (selective CI)
+-- pyproject.toml              # Project metadata and dependencies
```

---

## CI Stages

| # | Stage              | Description                                           | Quality Gate                        | Tools                                      |
| - | ------------------ | ----------------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| 1 | **Lint**           | Code style, import ordering, dead code detection      | Zero lint errors                    | eslint, swiftlint, ktlint, black, ruff     |
| 2 | **Type Check**     | Static type verification (TypeScript + Python)        | Zero type errors                    | tsc --noEmit, mypy --strict                |
| 3 | **Unit Test**      | Isolated component tests with mocked dependencies     | >= 90% coverage, zero failures      | jest, xctest, junit, pytest                |
| 4 | **Integration Test** | Service-to-service contracts, database interactions | All contracts pass                  | supertest, testcontainers, localstack      |
| 5 | **Security Scan**  | Dependency vulns, SAST, secret detection, SBOM        | Zero critical/high vulns, no secrets | snyk, codeql, gitleaks, trivy, syft        |
| 6 | **Build**          | Compile, bundle, containerize, sign artifacts         | Successful build, size within budget | docker, esbuild, gradle, xcodebuild, cosign |
| 7 | **E2E Test**       | Full system integration against staging               | All critical paths pass             | playwright, detox, k6                      |
| 8 | **Performance Test** | Load testing, latency benchmarks, memory profiling  | P99 < 200 ms, no memory leaks       | k6, artillery, clinic.js                   |

Stages 1 (Lint) and 5 (Security Scan) run **in parallel** when both are eligible, reducing wall-clock time.

---

## CD Stages

| # | Stage                  | Traffic | Rollback Trigger                       | Approval |
| - | ---------------------- | ------- | -------------------------------------- | -------- |
| 1 | **Staging Deploy**     | --      | Any E2E test failure                   | No       |
| 2 | **Staging Smoke**      | --      | Any smoke test failure                 | No       |
| 3 | **Canary Deploy**      | 5%      | Error rate > 1%, P99 > 500 ms          | Yes      |
| 4 | **Canary Validation**  | 5%      | Anomaly detection trigger              | No       |
| 5 | **Progressive Rollout** | 5% -> 25% -> 50% -> 100% | Any metric regression      | No       |
| 6 | **Post-Deploy Verify** | 100%    | Critical alert within 30 min           | No       |

Deployments use **weighted ALB target groups** for traffic shifting with automatic rollback to previous ECS task definitions when any trigger fires.

---

## Quality Gates

The quality-gate engine (`quality_gates/gate.py`) evaluates every stage result against configurable thresholds before the pipeline advances.

| Metric                      | Threshold           |
| --------------------------- | ------------------- |
| Unit test coverage          | >= 90%              |
| Lint errors                 | 0                   |
| Type errors                 | 0                   |
| Critical/high vulnerabilities | 0                 |
| P99 latency                 | < 200 ms            |
| Docker image size           | < 500 MB            |
| Canary error rate           | < 1%                |
| Canary P99 latency          | < 500 ms            |
| SBOM generation             | Required            |
| Container signing           | Required            |

Gate statuses: `PASSED`, `FAILED`, `WARNING`, `SKIPPED`. Results are exportable as JSON for dashboard integration.

---

## Git Flow

The repository follows **GitFlow** branching:

```
main --------o---------o---------> production releases
              \       /
staging -------o-----o-----------> pre-production validation
                \   /
develop ---------o-o--------------> integration branch
                / | \
feature/*  ----   |  ----
hotfix/*   -------
release/*  -------
```

| Branch        | Purpose                                   | Deploys To  |
| ------------- | ----------------------------------------- | ----------- |
| `main`        | Production-ready code                     | Production  |
| `staging`     | Pre-production validation                 | Staging     |
| `develop`     | Integration branch for feature work       | Dev         |
| `feature/*`   | New feature development                   | Dev (PR)    |
| `hotfix/*`    | Urgent production fixes                   | Production  |
| `release/*`   | Release candidate stabilization           | Staging     |

---

## SDK Release Automation

The SDK release system (`stages/sdk/sdk_release.py`) manages the full lifecycle for all four platform SDKs.

| Platform     | Package Name                | Registry                          | Build Tool   |
| ------------ | --------------------------- | --------------------------------- | ------------ |
| Web          | `@aether/sdk`               | npm + CDN (cdn.aether.network)    | esbuild      |
| iOS          | `AetherSDK`                 | CocoaPods + Swift Package Manager | xcodebuild   |
| Android      | `com.aether:aether-android` | Maven Central                     | gradle       |
| React Native | `@aether/react-native`      | npm                               | metro        |

### Release Features

- **Semantic versioning** -- patch, minor, major bumps with pre-release tags (alpha, beta, rc)
- **Automatic changelogs** -- generated from commit history per platform
- **Dry-run mode** -- validate the full release flow without publishing
- **Parallel coordination** -- release multiple platforms concurrently
- **Rollback-safe** -- version commits only occur after successful publish
- **Notification integration** -- Slack alerts on release success or failure

---

## Shared Utilities

All pipeline stages delegate to a common set of utilities in `shared/`, eliminating duplication.

### `runner.py`

| Function   | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `run_cmd()` | Single subprocess wrapper with timeout, env merging, and structured `CommandResult` |
| `log()`    | Consistent `[STAGE] message` pipeline logging                           |
| `timed()`  | Wraps any callable with timing and automatic log output                 |

### `notifier.py`

Dispatches pipeline events to **Slack** and **PagerDuty**:

| Channel           | Purpose                   |
| ----------------- | ------------------------- |
| `#aether-ci`      | CI pipeline events        |
| `#aether-deploys` | CD deployment events      |
| `#aether-alerts`  | Rollback and drift alerts |

Notifications fire on: CI failure, CD start, CD success, rollback, and Terraform drift detection.

### `change_detect.py`

Monorepo-aware change detection that compares against `origin/develop` to run only affected services through the pipeline. Paths under `.github/`, `config/`, `infrastructure/`, and `packages/common/` always trigger a full pipeline run.

---

## Monorepo Structure

The pipeline manages the following Aether monorepo layout:

**Packages (5)**

| Path                         | Language   | Build Tool |
| ---------------------------- | ---------- | ---------- |
| `packages/sdk-web`           | TypeScript | esbuild    |
| `packages/sdk-ios`           | Swift      | xcodebuild |
| `packages/sdk-android`       | Kotlin     | gradle     |
| `packages/sdk-react-native`  | TypeScript | metro      |
| `packages/common`            | TypeScript | esbuild    |

**Services (9)**

| Path                       | Language   | Runtime |
| -------------------------- | ---------- | ------- |
| `services/ingestion`       | TypeScript | Node    |
| `services/identity`        | TypeScript | Node    |
| `services/analytics`       | TypeScript | Node    |
| `services/ml-serving`      | Python     | Python  |
| `services/agent`           | Python     | Python  |
| `services/campaign`        | TypeScript | Node    |
| `services/consent`         | TypeScript | Node    |
| `services/notification`    | TypeScript | Node    |
| `services/admin`           | TypeScript | Node    |

---

## Infrastructure

Terraform modules managed by this pipeline:

```
vpc | ecs | rds | elasticache | neptune | s3 | cloudfront | sagemaker | iam | monitoring
```

| Setting               | Value                        |
| --------------------- | ---------------------------- |
| State backend         | S3 (`aether-terraform-state`) |
| Lock table            | DynamoDB (`aether-terraform-locks`) |
| Plan review           | Atlantis                     |
| Drift detection       | Daily at 06:00 UTC           |

**AWS Accounts:**

| Account              | Environment | Purpose                          |
| -------------------- | ----------- | -------------------------------- |
| `aether-dev`         | dev         | Development and testing          |
| `aether-staging`     | staging     | Pre-production validation        |
| `aether-production`  | production  | Live customer traffic            |
| `aether-data`        | data        | Data lake and ML training        |
| `aether-security`    | security    | Centralized logging and security |

---

## Installation

### Prerequisites

- Python >= 3.9
- pip or a PEP 517-compatible installer

### Install

```bash
# Core (no optional dependencies)
pip install .

# With Slack/PagerDuty notifications
pip install ".[notifications]"

# Full development environment
pip install ".[all]"
```

---

## Quick Start

```bash
# Run the full pipeline demo (CI -> Quality Gates -> CD -> SDK Release)
python3 main.py
```

The demo runner exercises every pipeline stage in sequence, printing configuration, quality-gate evaluations, deployment simulations, and SDK release flows.

---

## Configuration Reference

All pipeline configuration lives in `config/pipeline_config.py`. Key exports:

| Export                    | Type                  | Description                                   |
| ------------------------- | --------------------- | --------------------------------------------- |
| `CI_STAGES`              | `List[CIStage]`       | 8 CI stage definitions with tools and gates   |
| `CD_STAGES`              | `List[CDStage]`       | 6 CD stage definitions with rollback triggers |
| `QUALITY_THRESHOLDS`     | `QualityThresholds`   | All pass/fail thresholds                      |
| `SDK_RELEASE_TARGETS`    | `List[SDKReleaseTarget]` | 4 platform release configurations          |
| `BRANCH_CONFIG`          | `BranchConfig`        | GitFlow branch naming                         |
| `AWS_ACCOUNTS`           | `List[AWSAccount]`    | 5 AWS account definitions                     |
| `REPO_SERVICES`          | `Dict`                | 9 microservice paths and metadata             |
| `REPO_PACKAGES`          | `Dict`                | 5 SDK/shared package paths                    |
| `TERRAFORM_CONFIG`       | `TerraformConfig`     | IaC backend and module list                   |
| `NOTIFICATION_CONFIG`    | `NotificationConfig`  | Slack channels and PagerDuty settings         |
| `CACHE_CONFIG`           | `CacheConfig`         | Turbo, Docker, ECR caching settings           |
| `CHANGE_DETECTION_CONFIG` | `ChangeDetectionConfig` | Selective CI path mappings                 |

---

## Development Commands

```bash
# Run the pipeline demo
python3 main.py

# Lint (ruff)
ruff check .

# Type check (mypy)
mypy --strict .

# Run tests
pytest

# Format code
ruff format .
```

### Tool Configuration

| Tool | Setting         | Value |
| ---- | --------------- | ----- |
| ruff | target-version  | py39  |
| ruff | line-length     | 100   |
| mypy | python_version  | 3.9   |
| mypy | strict          | true  |

---

## License

Proprietary. All rights reserved.
