# Consent Model

Five canonical purposes. Defined in `packages/shared/consent.ts`.
Implemented identically across Web, iOS, Android, and React Native.

| Purpose | Gates |
|---|---|
| `analytics` | track, page, screen, heartbeat, error, performance, identify |
| `marketing` | experiment, conversion |
| `web3` | wallet, transaction, contract_action |
| `agent` | agent_task, agent_decision, a2h_interaction |
| `commerce` | payment_*, approval_*, entitlement_*, access_*, x402_payment |

## Rules

1. `ConsentState` has exactly these five boolean fields plus `updatedAt` and
   `policyVersion`. No extra purposes are recognized.
2. The SDK stamps `ConsentState` onto every event's `context.consent`.
3. Before transport, the SDK **drops** any event whose required purpose is
   `false` (exception: `consent` events are always allowed).
4. The backend ingestion validator re-checks consent; a mis-gated event is
   discarded again server-side.
5. Changing `ConsentState` emits a `consent` event so the lake retains a
   continuous audit trail.

## Defaults

All purposes default to `false`. The host app must call `consent.grant([...])`
or display the banner.

## Native platforms

On iOS/Android the API accepts `List<String>` / `[String]` of purposes.
Use only the canonical five strings. Other values are silently ignored by
the backend validator.
