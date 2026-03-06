# Aether SDK v7.0.0 — Architecture Guide

## Overview

Aether v7.0 adopts a **"Sense and Ship"** thin-client architecture across all platforms (Web, iOS, Android, React Native). The SDK collects raw user interactions, device fingerprints, wallet events, and session data — then ships everything to the Aether backend for processing, enrichment, identity resolution, and analysis.

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   Client SDK                │  HTTP  │   Aether Backend                 │
│   (Sense & Ship)            │ ────>  │   (Process, Resolve, Enrich)     │
│                             │        │                                  │
│  - DOM / UI event listeners │  POST  │  - IP enrichment (MaxMind)       │
│  - Device fingerprinting    │  /v1/  │  - Identity resolution           │
│  - Wallet detection (7 VMs) │ batch  │    (deterministic + probabilistic│
│  - Raw event batching       │        │     cross-device matching)       │
│  - Session & identity mgmt  │  GET   │  - ML inference (intent, bot)    │
│  - Consent gates (GDPR)     │  /v1/  │  - DeFi tx classification        │
│  - Feature flag cache       │ config │  - Traffic source classification │
│  - Fingerprint generation   │        │  - Funnel matching & analysis    │
│                             │        │  - Heatmap grid generation       │
│                             │        │  - Whale detection               │
└─────────────────────────────┘        └──────────────────────────────────┘
```

## Design Principles

1. **Collect, don't compute** — The SDK captures raw data (clicks, scrolls, wallet connections, transactions, fingerprints) and ships it unprocessed. All classification, scoring, and analysis happens server-side.

2. **Minimal context, maximum signal** — Mobile SDKs send `{os, osVersion, locale, timezone}`. The backend derives device model, screen size, and capabilities from HTTP headers. Web SDK includes device fingerprint hash.

3. **Config from server** — Feature flags, funnel definitions, and survey triggers are fetched from `GET /v1/config` on init and cached locally. No client-side evaluation logic.

4. **Offline-first** — Events are queued in memory and batch-flushed. Network failures result in retry with exponential backoff, not data loss.

5. **Consent-gated** — All data collection respects GDPR/CCPA consent state. The SDK gates collection categories locally before any data leaves the device. Device fingerprinting is skipped when GDPR mode is active and analytics consent is not granted.

6. **Privacy by design** — All PII (email, phone, IP) is SHA-256 hashed before storage. Device fingerprints are composite hashes — raw signals never leave the client. Raw IP addresses are never persisted.

## SDK Architecture

### Module Architecture (Web SDK)

```
AetherSDK (index.ts) — v7.0.0
│
├── Core (always loaded)
│   ├── EventQueue .............. Batch + offline queue (POST /v1/events)
│   ├── SessionManager ......... Session lifecycle + heartbeat
│   ├── IdentityManager ........ Multi-wallet identity + traits
│   ├── ConsentModule .......... GDPR/CCPA consent gates
│   └── DeviceFingerprintCollector  SHA-256 from 17 browser signals
│
├── Web2 Analytics (thin event emitters)
│   ├── AutoDiscovery .......... Click listener (raw {selector, x, y})
│   ├── Ecommerce .............. 5 methods: view, cart, checkout, purchase
│   ├── FeatureFlags ........... Cache-only (fetch from /v1/config)
│   ├── FormAnalytics .......... focus/blur/change events
│   ├── Funnels ................ Event tagger from server config
│   └── Heatmaps ............... Raw coordinate emitter
│
├── Web3 (wallet detection + raw tx shipping)
│   ├── 7 VM Providers ......... EVM, SVM, Bitcoin, Move, NEAR, TRON, Cosmos
│   └── 7 VM Trackers .......... Raw transaction data emitters
│
├── Context
│   ├── SemanticContext ........ Tier 1 only (device, viewport, URL)
│   └── TrafficSource .......... Raw UTM/referrer/click ID shipper
│
└── Rewards (thin API client)
    └── RewardClient ........... eligibility + claim via backend API
```

### Device Fingerprinting

All SDKs generate a deterministic device fingerprint (SHA-256 hash) that is included in every event's `context.fingerprint.id`. Only the composite hash leaves the device — raw signals are never transmitted.

| Platform | Signals | Method |
|---|---|---|
| **Web** | Canvas rendering, WebGL renderer/vendor, audio context, font detection (24 fonts), screen resolution, color depth, timezone, language, platform, hardware concurrency, device memory, touch support, cookie support, DNT, pixel ratio | SHA-256 via Web Crypto API, cached in localStorage (7-day TTL) |
| **iOS** | `identifierForVendor`, device model, system version, screen dimensions, scale, locale, timezone, processor count, physical memory | SHA-256 via CryptoKit |
| **Android** | `ANDROID_ID`, `Build.MODEL`, `Build.MANUFACTURER`, OS version, display metrics (width, height, density), locale, timezone, available processors | SHA-256 via `MessageDigest` |
| **React Native** | Delegates to native module: `NativeModules.AetherNative.getFingerprint()` | Native implementation (iOS/Android) |

## Identity Resolution

The backend runs a cross-device identity resolution engine that merges user profiles into **Identity Clusters** using deterministic and probabilistic signals.

### Identity Graph Schema

```
                    ┌──────────────────┐
                    │  IdentityCluster │
                    │  (single source  │
                    │   of truth)      │
                    └────────┬─────────┘
                 MEMBER_OF_CLUSTER
          ┌──────────┼──────────┐
          ▼          ▼          ▼
     ┌────────┐ ┌────────┐ ┌────────┐
     │ User A │ │ User B │ │ User C │
     │(phone) │ │(laptop)│ │(tablet)│
     └───┬────┘ └───┬────┘ └───┬────┘
         │          │          │
    ┌────┴────┬─────┴────┬─────┴────┐
    ▼         ▼          ▼          ▼
┌────────┐┌────────┐┌────────┐┌────────┐
│  Email ││ Device ││   IP   ││ Wallet │
│(hashed)││ Finger-││Address ││(on-    │
│        ││ print  ││(hashed)││ chain) │
└────────┘└────────┘└────────┘└────────┘
```

### Vertex Types

| Vertex | Key Properties |
|---|---|
| `User` | `anonymous_id`, `user_id`, `traits`, `tenant_id` |
| `DeviceFingerprint` | `fingerprint_id` (SHA-256), `canvas_hash`, `webgl_renderer`, `audio_hash`, `screen_resolution`, `timezone`, `language`, `platform` |
| `IPAddress` | `ip_hash` (SHA-256), `ip_range`, `asn`, `isp`, `is_vpn`, `is_proxy`, `is_tor` |
| `Location` | `country_code`, `region`, `city`, `latitude`, `longitude`, `timezone` |
| `Email` | `email_hash` (SHA-256), `domain`, `is_disposable` |
| `Phone` | `phone_hash` (SHA-256 of E.164), `country_code` |
| `Wallet` | `address`, `vm`, `chain_ids[]`, `ens`, `classification` |
| `IdentityCluster` | `cluster_id`, `canonical_user_id`, `confidence`, `member_count`, `resolution_status` |

### Edge Types

| Edge | Direction | Purpose |
|---|---|---|
| `HAS_FINGERPRINT` | User → DeviceFingerprint | Device ownership |
| `SEEN_FROM_IP` | User → IPAddress | Network observation |
| `LOCATED_IN` | User → Location | Geographic association |
| `HAS_EMAIL` | User → Email | Email ownership (deterministic) |
| `HAS_PHONE` | User → Phone | Phone ownership (deterministic) |
| `OWNS_WALLET` | User → Wallet | Wallet ownership (deterministic) |
| `MEMBER_OF_CLUSTER` | User → IdentityCluster | Cluster membership |
| `SIMILAR_TO` | User → User | Probabilistic similarity link |
| `IP_MAPS_TO` | IPAddress → Location | Geolocation mapping |
| `RESOLVED_AS` | User → User | Identity merge (audit trail) |

### Resolution Signals

**Deterministic (confidence = 1.0, auto-merge):**
- `UserIdSignal` — Same `userId` across profiles
- `EmailSignal` — Same normalized email hash (Gmail dot/plus normalization)
- `PhoneSignal` — Same E.164 phone hash
- `WalletAddressSignal` — Same wallet address + VM type
- `OAuthSignal` — Same OAuth provider + subject

**Probabilistic (weighted composite scoring):**

| Signal | Weight | Scoring |
|---|---|---|
| FingerprintSimilarity | 0.35 | Component-level: canvas (30%), WebGL (25%), audio (15%), screen (5%), timezone+lang (10%), platform (5%), hardware (5%), fonts (5%) |
| NetworkGraphProximity | 0.20 | Jaccard similarity on shared graph neighbors |
| IPCluster | 0.15 | Same IP = 0.8, same /24 = 0.4, same ASN = 0.15 (VPN discounted) |
| BehavioralSimilarity | 0.15 | Cosine similarity on session timing, page frequency, event mix |
| LocationProximity | 0.15 | Same city = 0.6, same region = 0.3, same country = 0.1 |

### Resolution Flow

```
SDK Event (with fingerprint + identifiers)
    │
    ▼
Ingestion Service
    ├── IP Enrichment (MaxMind GeoLite2)
    ├── Normalize & validate
    └── Publish SDK_EVENTS_VALIDATED
         │
         ▼
Resolution Consumer (real-time)
    ├── 1. Extract identifiers (anonymousId, userId, email, phone, wallets, fingerprintId, ip_hash)
    ├── 2. Upsert graph vertices (DeviceFingerprint, IPAddress, Location, Email, Phone, Wallet)
    ├── 3. Create/update edges (HAS_FINGERPRINT, SEEN_FROM_IP, HAS_EMAIL, etc.)
    ├── 4. Find candidate profiles (other Users linked to same vertices)
    └── 5. Run deterministic signals
              │
              ├── Match found → AUTO MERGE (confidence = 1.0)
              └── No match → Queue for batch
                               │
                               ▼
                  Batch Resolution Job (hourly)
                    ├── Run probabilistic signals on candidates
                    ├── Compute weighted composite score
                    └── Apply rules engine:
                          ├── >= 0.95 → auto_merge (if configured)
                          ├── >= 0.70 → flag_for_review
                          └── < 0.70  → reject
```

## Backend API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/events` | POST | Batched raw events (Web SDK) |
| `/v1/batch` | POST | Batched raw events (iOS/Android) |
| `/v1/config` | GET | SDK init config (flags, funnels, surveys) |
| `/v1/tx/enrich` | POST | Transaction classification + DeFi labeling |
| `/v1/chains/{id}` | GET | Chain metadata on demand |
| `/v1/protocols/{addr}` | GET | Protocol identification |
| `/v1/predict` | POST | ML inference (intent, bot, scoring) |
| `/v1/rewards/{id}/eligibility` | GET | Reward eligibility check |
| `/v1/rewards/{id}/payload` | GET | Pre-built claim transaction |
| `/v1/rewards/{id}/claim` | POST | Submit on-chain claim |
| `/v1/classify-source` | POST | Traffic source classification |
| `/v1/wallet-label/{addr}` | GET | Wallet risk + label |
| `/v1/resolution/cluster/{user_id}` | GET | Identity cluster for a user |
| `/v1/resolution/pending` | GET | Pending merge decisions (admin) |
| `/v1/resolution/pending/{id}/approve` | POST | Approve merge |
| `/v1/resolution/pending/{id}/reject` | POST | Reject merge |
| `/v1/resolution/audit/{id}` | GET | Audit trail for a decision |
| `/v1/resolution/config` | GET/PUT | Resolution thresholds |
| `/v1/resolution/batch` | POST | Trigger batch matching job |

## Event Flow

```
1. User action (click, scroll, wallet connect, purchase)
         │
2. SDK captures raw event data + device fingerprint
         │
3. Consent check (is this category allowed?)
         │
4. Event queued in memory (+ persisted to localStorage/AsyncStorage)
         │
5. Batch threshold reached OR flush timer fires
         │
6. POST /v1/events { batch: [...events], sentAt, context }
         │
7. Backend pipeline:
   ├── IP enrichment (MaxMind GeoLite2)
   ├── Identity resolution (deterministic + probabilistic)
   ├── ML scoring (intent, bot detection)
   ├── DeFi transaction classification
   ├── Traffic source classification
   ├── Funnel matching
   └── Heatmap grid generation
```

## SDK Size Comparison

| SDK | v6.x (Fat Client) | v7.0 (Thin Client) | Reduction |
|---|---|---|---|
| **Web** | ~12,700 LOC | ~5,200 LOC | 59% |
| **iOS** | 474 LOC | 535 LOC | +13% (new features) |
| **Android** | 372 LOC | 493 LOC | +33% (new features) |
| **React Native** | 1,064 LOC | 497 LOC | 53% |

> iOS and Android grew because wallet tracking, consent management, ecommerce stubs, feature flags, and device fingerprinting were added. The net payload still decreased because device introspection was removed (backend derives from headers).

## What Moved to Backend

| Capability | Was (Client) | Now (Backend) |
|---|---|---|
| ML Intent Prediction | `edge-ml.ts` (401 LOC) | `POST /v1/predict` |
| Bot Detection | `edge-ml.ts` | `POST /v1/predict` |
| DeFi Classification | `protocol-registry.ts` + 15 trackers | `POST /v1/tx/enrich` |
| Portfolio Aggregation | `portfolio-tracker.ts` (209 LOC) | Backend aggregation service |
| Wallet Classification | `wallet-classifier.ts` (170 LOC) | `GET /v1/wallet-label/{addr}` |
| Chain Registry | `chain-registry.ts` + `evm-chains.ts` | `GET /v1/chains/{id}` |
| Traffic Source Classification | Regex engine (431 LOC) | `POST /v1/classify-source` |
| Survey Rendering | `feedback.ts` (596 LOC) | Backend-rendered iframe |
| A/B Experiments | `experiments.ts` (125 LOC) | Feature flags module |
| Web Vitals | `performance.ts` (188 LOC) | External tools (Sentry, DataDog) |
| OTA Data Updates | `update-manager.ts` (301 LOC) | `GET /v1/config` |
| Funnel Matching | `funnels.ts` (357 LOC) | Backend event matching |
| Heatmap Aggregation | Grid building (392 LOC) | Backend grid generation |
| Identity Resolution | N/A (not available) | Backend resolution service |

## Platform Parity

All four SDKs expose the same core public API surface:

| Method | Web | iOS | Android | React Native |
|---|---|---|---|---|
| `init(config)` | Y | Y | Y | Y |
| `track(event, props)` | Y | Y | Y | Y |
| `pageView` / `screenView` | Y | Y | Y | Y |
| `conversion(event, value)` | Y | Y | Y | Y |
| `hydrateIdentity(data)` | Y | Y | Y | Y |
| `getIdentity()` | Y | Y | Y | Y |
| `walletConnected(addr)` | Y | Y | Y | Y |
| `walletDisconnected(addr)` | Y | Y | Y | Y |
| `walletTransaction(tx)` | Y | Y | Y | Y |
| `grantConsent(categories)` | Y | Y | Y | Y |
| `revokeConsent(categories)` | Y | Y | Y | Y |
| `trackProductView(product)` | Y | Y | Y | Y |
| `trackAddToCart(item)` | Y | Y | Y | Y |
| `trackPurchase(order)` | Y | Y | Y | Y |
| `isFeatureEnabled(key)` | Y | Y | Y | Y |
| `getFeatureValue(key)` | Y | Y | Y | Y |
| `getFingerprint()` | Y* | Y | Y | Y |
| `flush()` | Y | Y | Y | Y |
| `reset()` | Y | Y | Y | Y |

*Web SDK auto-generates fingerprint on init; available via `context.fingerprint.id` in every event.

## Safety Mechanisms

| Mechanism | Description |
|---|---|
| **Max cluster size** | Refuse merge if resulting cluster exceeds 50 profiles (configurable). Prevents cascading merges in NAT/VPN scenarios. |
| **Cooldown** | Don't re-evaluate rejected pairs for 24 hours. |
| **Fraud gate** | If either profile has fraud score > 40, route to manual review regardless of identity confidence. |
| **Undo capability** | `RESOLVED_AS` edges store full signal snapshots. Merges can be reversed by restoring the secondary profile. |
| **Privacy** | All PII (email, phone, IP) stored as SHA-256 hashes only. Raw values never persisted in graph or audit trail. |
