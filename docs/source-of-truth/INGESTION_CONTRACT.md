# Ingestion Contract

One public SDK ingestion path. All four SDKs use it.

## Endpoint

```
POST {endpoint}/v1/batch
Authorization: Bearer {apiKey}
Content-Type: application/json
```

Default `endpoint` = `https://api.aether.io`.

## Request body

```ts
{
  batch: BaseEvent[];    // 1..500 events
  sentAt: string;        // ISO8601
  context?: { library: { name: string; version: string } }
}
```

`BaseEvent` is defined in `packages/shared/events.ts`:

```ts
interface BaseEvent {
  id: string;              // UUID (client-generated)
  type: EventType;         // from canonical enum
  timestamp: string;       // ISO8601 client clock
  sessionId: string;       // UUID per session
  anonymousId: string;     // UUID per install / browser
  userId?: string;         // after hydrateIdentity
  properties?: Record<string, unknown>;
  context: EventContext;   // library + page/device/campaign/consent/...
}
```

## Auth

Bearer token = `apiKey` from Aether dashboard. Rate-limited server-side via
token bucket (`aether:ratelimit:{api_key}`).

## Backend routing

The `/v1/batch` path is served by the **Data Lake ingestion service**
(`Data Lake Architecture/aether-Datalake-backend/services/ingestion/`).
From there events flow into Kafka (`aether.sdk.events.validated`) and into
Bronze/Silver/Gold lake tiers.

## Not for SDK use

The FastAPI path `POST /v1/ingest/events[/batch]` in
`Backend Architecture/aether-backend/services/ingestion/routes.py` is used
for **server-to-server connector ingestion only**. SDKs must not target it.

## Retries & offline

- Web: localStorage persistence up to 1000 events; 3x exponential backoff
  (1s → 2s → 4s, cap 30s).
- Native: in-memory queue with coroutine/async flush on lifecycle events.
- RN: delegates to native.

## Schema version

Every SDK sets `context.library.name = '@aether/{platform}'` and
`context.library.version = <semver>`. The contract schema version lives in
`packages/shared/schema-version.ts` and is bumped only on breaking changes.
