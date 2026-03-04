# Aether

**Full-stack behavioral analytics, identity resolution, and AI-powered insights platform with multi-chain Web3 support.**

Aether is a modular analytics platform that captures user behavior across web, mobile, and Web3 touchpoints (7 VM families, 20+ blockchains, 150+ DeFi protocols), resolves identities across sessions and devices, runs ML predictions (churn, LTV, journey forecasting), and orchestrates campaigns — all with GDPR compliance and SOC 2 readiness built in.

## Architecture Overview

```
                     SDK Layer                          Backend Layer
              +-------------------+               +---------------------+
              | Web SDK (TS)      |               | API Gateway         |
              | React Native SDK  |  ── HTTPS ──> | Ingestion Service   |
              | iOS SDK (Swift)   |               | Identity Service    |
              | Android SDK (Kt)  |               | Analytics Service   |
              +-------------------+               | ML Serving          |
                                                  | Agent Service       |
              +-------------------+               | Campaign Service    |
              | Data Ingestion    |               | Consent Service     |
              | (Node.js pipeline)|               | Notification Svc    |
              +-------------------+               | Admin Service       |
                       |                          +---------------------+
                       v                                    |
              +-------------------+               +---------------------+
              | Data Lake         |               | Agent Layer         |
              | (S3 + TimescaleDB |               | (10 Celery Workers) |
              |  + Neptune Graph) |               +---------------------+
              +-------------------+                         |
                       |                          +---------------------+
              +-------------------+               | ML Models           |
              | AWS Infrastructure|               | (9 models: edge +   |
              | (Multi-AZ, DR)    |               |  server-side)       |
              +-------------------+               +---------------------+
                       |
              +-------------------+
              | GDPR & SOC 2      |
              | Compliance        |
              +-------------------+
```

## Packages

| Package | Language | Description | Location |
|---------|----------|-------------|----------|
| [Web SDK](packages/web/) | TypeScript | Browser analytics SDK with consent, multi-chain Web3 (7 VMs), Edge ML | `packages/web/` |
| [React Native SDK](packages/react-native/) | TypeScript | React Native bridge to native iOS/Android SDKs | `packages/react-native/` |
| [Mobile SDK](Aether%20Mobile%20SDK/) | Swift / Kotlin | Native iOS and Android SDKs | `Aether Mobile SDK/` |
| [Playground](playground/) | HTML / Vite | Multi-VM Web3 wallet simulation playground | `playground/` |
| [Data Ingestion](Data%20Ingestion%20Layer/) | TypeScript | Event ingestion, validation, enrichment pipeline | `Data Ingestion Layer/` |
| [Data Lake](Data%20Lake%20Architecture/) | Python / TS | Distributed data warehouse with 13+ services | `Data Lake Architecture/` |
| [Agent Layer](Agent%20Layer/) | Python | 10 autonomous discovery & enrichment workers | `Agent Layer/` |
| [Backend](Backend%20Architecture/) | Python | FastAPI microservices (10 services, 50+ endpoints) | `Backend Architecture/` |
| [ML Models](ML%20Models/) | Python | 9 production ML models (edge + server) | `ML Models/` |
| [CI/CD Pipeline](cicd/) | Python | Deployment automation (8 CI + 6 CD + demo pipeline) | `cicd/` |
| [AWS Deployment](AWS%20Deployment/) | Python / HCL | Multi-account AWS infrastructure with Terraform (4 envs) | `AWS Deployment/` |
| [GDPR & SOC 2](GDPR%20%26%20SOC2/) | Python | GDPR compliance & SOC 2 Type II readiness | `GDPR & SOC2/` |

## Technology Stack

- **SDKs:** TypeScript (Web), Swift (iOS), Kotlin (Android), React Native
- **Backend:** Python 3.11+, FastAPI, Celery
- **Data:** PostgreSQL (TimescaleDB), Neptune (Graph), Redis, DynamoDB, S3, OpenSearch
- **ML:** PyTorch, TensorFlow, XGBoost, scikit-learn, SageMaker, ONNX
- **Infrastructure:** AWS (ECS Fargate, ALB, CloudFront, WAF), Terraform
- **Web3:** EVM, SVM (Solana), Bitcoin, MoveVM (SUI), NEAR, TVM (TRON), Cosmos
- **CI/CD:** GitHub Actions, Docker, canary deployments, demo environment
- **Compliance:** GDPR (Articles 15-21, 25, 28, 30, 33-35), SOC 2 Type II

## Quick Start

```bash
# Install monorepo dependencies
npm install

# Run the playground
cd playground && npm run dev

# Run backend
cd "Backend Architecture/aether-backend" && python3 main.py

# Run ML models
cd "ML Models/aether-ml" && python3 -m training.pipelines.train

# Run compliance framework
cd "GDPR & SOC2/aether-compliance" && python3 main.py
```

## Key Capabilities

### Analytics & Identity
- Behavioral event tracking (page views, clicks, scrolls, custom events)
- Cross-device identity resolution via graph database
- Session management with automatic timeout and resumption
- Multi-chain Web3 wallet tracking (EVM, SVM, Bitcoin, MoveVM, NEAR, TVM, Cosmos)
- DeFi protocol detection across 15 categories (DEX, lending, perpetuals, staking, bridges, NFTs, etc.)
- Wallet classification (hot, cold, smart, exchange, protocol, multisig)
- Cross-chain portfolio aggregation

### Machine Learning
- **Edge models** (< 100ms, browser-side): Intent prediction, bot detection, session scoring
- **Server models** (SageMaker): Churn, LTV, journey prediction, anomaly detection, attribution
- Model monitoring with drift detection and automated retraining

### Compliance
- GDPR: 7 data protection controls, 6 data subject rights, consent management, breach notification
- SOC 2: 5 trust criteria, 34 controls, gap analysis, continuous compliance monitoring
- Record of Processing Activities (ROPA), cross-border transfer tracking

### Infrastructure
- Multi-account AWS (dev, staging, production, demo, data, security)
- Multi-AZ with DR (RPO 1h, RTO 4h)
- CI/CD with quality gates (coverage 90%, security scanning, performance budgets)
- Demo environment for sales/BD with pre-seeded data and auto-teardown

## License

Proprietary. All rights reserved.
