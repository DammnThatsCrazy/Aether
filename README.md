# Aether

**Full-stack behavioral analytics, identity resolution, and AI-powered insights platform with multi-chain Web3 support.**

Aether is a modular analytics platform that captures user behavior across web, mobile, and Web3 touchpoints (7 VM families, 20+ blockchains, 150+ DeFi protocols), resolves identities across sessions and devices, runs ML predictions (churn, LTV, journey forecasting), and orchestrates campaigns — all with GDPR compliance and SOC 2 readiness built in.

## Architecture Overview

```
                     SDK Layer                          Backend Layer (16 services, 85+ endpoints)
              +-------------------+               +-------------------------------+
              | Web SDK (TS)      |               | API Gateway    | Ingestion    |
              | React Native SDK  |  ── HTTPS ──> | Identity       | Analytics    |
              | iOS SDK (Swift)   |               | ML Serving     | Agent        |
              | Android SDK (Kt)  |               | Campaign       | Consent      |
              +-------------------+               | Notification   | Admin        |
                                                  | Traffic        | Fraud        |
              +-------------------+               | Attribution    | Rewards      |
              | Web2 Analytics    |               | Oracle         | Automation   |
              | Modules           |               +-------------------------------+
              | (Ecommerce, Forms,|                         |
              |  Feature Flags,   |               +-------------------------------+
              |  Feedback, Heatmaps|              | Multi-chain Oracle Bridge     |
              |  Funnels)         |               | (7 VMs: EVM, SVM, Bitcoin,    |
              +-------------------+               |  MoveVM, NEAR, TVM, Cosmos)   |
                                                  +-------------------------------+
              +-------------------+                         |
              | Data Ingestion    |               +-------------------------------+
              | (Node.js pipeline)|               | Multi-chain Smart Contracts   |
              +-------------------+               | (EVM, Solana, SUI, NEAR,      |
                       |                          |  Cosmos) + Reward Pipeline    |
                       |                          +-------------------------------+
                       v                                    |
              +-------------------+               +-------------------------------+
              | Data Lake         |               | Agent Layer                   |
              | (S3 + TimescaleDB |               | (10 Celery Workers)           |
              |  + Neptune Graph) |               +-------------------------------+
              +-------------------+                         |
                       |                          +-------------------------------+
              +-------------------+               | ML Models                     |
              | OTA Update System |               | (9 models: edge + server-side)|
              | (CDN Data Modules)|               +-------------------------------+
              +-------------------+                         |
                       |                          +-------------------------------+
              +-------------------+               | 150+ DeFi Protocols           |
              | AWS Infrastructure|               | (DEX, lending, perpetuals,    |
              | (Multi-AZ, DR)    |               |  staking, bridges, NFTs, ...) |
              +-------------------+               +-------------------------------+
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
| [Backend](Backend%20Architecture/) | Python | FastAPI microservices (16 services, 85+ endpoints) | `Backend Architecture/` |
| [ML Models](ML%20Models/) | Python | 9 production ML models (edge + server) | `ML Models/` |
| [CI/CD Pipeline](cicd/) | Python | Deployment automation (8 CI + 6 CD + demo pipeline) | `cicd/` |
| [AWS Deployment](AWS%20Deployment/) | Python / HCL | Multi-account AWS infrastructure with Terraform (4 envs) | `AWS Deployment/` |
| [GDPR & SOC 2](GDPR%20%26%20SOC2/) | Python | GDPR compliance & SOC 2 Type II readiness | `GDPR & SOC2/` |
| [Smart Contracts](Smart%20Contracts/) | Solidity / Rust / Move | Multi-chain reward contracts (EVM, Solana, SUI, NEAR, Cosmos) | Smart Contracts/ |

## Technology Stack

- **SDKs:** TypeScript (Web), Swift (iOS), Kotlin (Android), React Native
- **Backend:** Python 3.11+, FastAPI, Celery
- **Data:** PostgreSQL (TimescaleDB), Neptune (Graph), Redis, DynamoDB, S3, OpenSearch
- **ML:** PyTorch, TensorFlow, XGBoost, scikit-learn, SageMaker, ONNX
- **Infrastructure:** AWS (ECS Fargate, ALB, CloudFront, WAF), Terraform
- **Web3:** EVM, SVM (Solana), Bitcoin, MoveVM (SUI), NEAR, TVM (TRON), Cosmos
- **Smart Contracts:** Solidity (EVM/TRON), Anchor/Rust (Solana), Move (SUI), Rust (NEAR/CosmWasm)
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

### Web2 Analytics Modules
- E-commerce tracking (product views, cart state, checkout funnel, orders, refunds)
- Form analytics (field-level interaction tracking, abandonment detection, drop-off analysis)
- Feature flags (remote config with stale-while-revalidate caching)
- Feedback surveys (NPS, CSAT, CES with trigger rules, sampling, and DOM rendering)
- Heatmaps (click, movement, scroll depth, attention tracking)
- Funnel tracking (multi-step conversion funnels with drop-off identification)

### Automated Reward Pipeline
- Multi-chain reward distribution across 7 VM families (EVM, SVM, Bitcoin, MoveVM, NEAR, TVM, Cosmos)
- 8-signal fraud detection engine with composable scoring
- 6-model multi-touch attribution (first/last touch, linear, time-decay, position-based, data-driven)
- Oracle-signed cryptographic proofs for on-chain verification
- Smart contracts on Ethereum, Solana, SUI, NEAR, and Cosmos

### Infrastructure
- Multi-account AWS (dev, staging, production, demo, data, security)
- Multi-AZ with DR (RPO 1h, RTO 4h)
- CI/CD with quality gates (coverage 90%, security scanning, performance budgets)
- Demo environment for sales/BD with pre-seeded data and auto-teardown

## License

Proprietary. All rights reserved.
