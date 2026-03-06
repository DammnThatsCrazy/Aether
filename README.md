# Aether

Cross-platform analytics SDK with Web3 wallet tracking, cross-device identity resolution, and on-chain reward automation.

## Architecture

Aether v7.0 uses a **"Sense and Ship"** thin-client architecture. SDKs collect raw events, device fingerprints, and wallet interactions — the backend handles all processing, ML inference, identity resolution, and analytics.

```
SDK (Web/iOS/Android/RN)          Backend (FastAPI + Neptune + TimescaleDB)
┌──────────────────────┐          ┌─────────────────────────────────┐
│ Raw events           │  POST    │ Ingestion → IP Enrichment       │
│ Device fingerprint   │  /v1/   │ Identity Resolution (10 signals)│
│ Wallet connections   │  batch   │ ML Scoring (intent, bot)        │
│ Session + identity   │ ──────> │ DeFi Tx Classification          │
│ Consent gates        │         │ Traffic Source Attribution       │
│ Feature flag cache   │  GET    │ Funnel Matching                 │
│                      │  /v1/   │ Heatmap Grid Generation         │
│                      │  config │ Reward Automation               │
└──────────────────────┘         └─────────────────────────────────┘
```

## SDKs

| Platform | Package | Size (v7.0) |
|---|---|---|
| **Web** | `@aether/web-sdk` | ~5,200 LOC |
| **iOS** | `AetherSDK` (Swift) | ~535 LOC |
| **Android** | `io.aether:sdk-android` (Kotlin) | ~493 LOC |
| **React Native** | `@aether/react-native-sdk` | ~497 LOC |

### Quick Start

**Web:**
```typescript
import aether from '@aether/web-sdk';

aether.init({ apiKey: 'your-key' });
aether.track('button_clicked', { buttonId: 'cta' });
aether.hydrateIdentity({
  userId: 'user-123',
  email: 'user@example.com',
});
```

**iOS:**
```swift
import AetherSDK
Aether.shared.initialize(config: AetherConfig(apiKey: "your-key"))
Aether.shared.track("button_tapped", properties: ["buttonId": AnyCodable("cta")])
```

**Android:**
```kotlin
import com.aether.sdk.Aether
Aether.initialize(application, AetherConfig(apiKey = "your-key"))
Aether.track("button_clicked", mapOf("buttonId" to "cta"))
```

**React Native:**
```tsx
import { AetherProvider } from '@aether/react-native-sdk';

<AetherProvider config={{ apiKey: 'your-key' }}>
  <App />
</AetherProvider>
```

## Key Features

- **Cross-device identity resolution** — Deterministic (email, phone, wallet, userId, OAuth) and probabilistic (fingerprint similarity, IP clustering, behavioral signals) matching into unified Identity Clusters
- **Device fingerprinting** — SHA-256 hash from platform-specific signals (Web: 17 browser signals via Web Crypto; iOS: CryptoKit; Android: MessageDigest)
- **Web3 wallet tracking** — 7 VM families: EVM, Solana, Bitcoin, Move/SUI, NEAR, TRON, Cosmos
- **DeFi transaction classification** — Protocol identification, swap/stake/lend/bridge categorization
- **On-chain reward automation** — Eligibility checks, pre-built claim payloads, oracle-verified proofs
- **GDPR/CCPA consent management** — Consent-gated data collection with banner UI
- **Feature flags** — Server-evaluated, locally cached
- **Web2 analytics** — Ecommerce, funnels, heatmaps, form analytics, traffic attribution
- **ML inference** — Server-side intent prediction, bot detection, session scoring

## Project Structure

```
packages/
├── web/              Web SDK (TypeScript)
├── ios/              iOS SDK (Swift)
├── android/          Android SDK (Kotlin)
└── react-native/     React Native SDK (TypeScript)

Backend Architecture/
└── aether-backend/
    ├── services/
    │   ├── ingestion/     Event ingestion + IP enrichment
    │   ├── identity/      Identity management
    │   ├── resolution/    Cross-device identity resolution
    │   ├── analytics/     Session scoring + anomaly detection
    │   ├── fraud/         Fraud detection
    │   ├── attribution/   Campaign attribution
    │   └── ml_serving/    ML model serving
    ├── shared/
    │   ├── graph/         Neptune graph client
    │   ├── events/        Event bus (Kafka/SNS)
    │   ├── cache/         Redis cache
    │   └── common/        Shared utilities
    └── main.py            FastAPI application

docs/
├── ARCHITECTURE.md       System architecture overview
├── BACKEND-API.md        API endpoint specification
├── IDENTITY-RESOLUTION.md  Identity resolution deep dive
├── SDK-WEB.md            Web SDK integration guide
├── SDK-IOS.md            iOS SDK integration guide
├── SDK-ANDROID.md        Android SDK integration guide
├── SDK-REACT-NATIVE.md   React Native SDK integration guide
├── MIGRATION-v7.md       v6 → v7 migration guide
└── CHANGELOG.md          Version history
```

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, module architecture, event flow |
| [Backend API](docs/BACKEND-API.md) | All API endpoints with request/response examples |
| [Identity Resolution](docs/IDENTITY-RESOLUTION.md) | Cross-device matching algorithms and graph schema |
| [Web SDK](docs/SDK-WEB.md) | Web integration guide |
| [iOS SDK](docs/SDK-IOS.md) | iOS integration guide |
| [Android SDK](docs/SDK-ANDROID.md) | Android integration guide |
| [React Native SDK](docs/SDK-REACT-NATIVE.md) | React Native integration guide |
| [Migration Guide](docs/MIGRATION-v7.md) | Breaking changes from v6 to v7 |
| [Changelog](docs/CHANGELOG.md) | Version history |

## License

Proprietary. All rights reserved.
