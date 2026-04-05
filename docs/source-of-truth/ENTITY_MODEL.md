# Entity Model

The canonical entity model unifies Web2, Web3, and hybrid companies under one
set of concepts. Entities are referenced in events via `EntityRef` from
`packages/shared/entities.ts`.

## Core (always present)

| Entity | Meaning |
|---|---|
| **Tenant** | Top-level customer of Aether (one per API key) |
| **Org** | Business account inside a tenant (B2B / multi-tenant apps) |
| **User** | End user, identified by `user_id` post-login |
| **Session** | One continuous interaction window |
| **Device** | Physical/logical device fingerprint |
| **Application** | Host app/product emitting events |

## Access plane

| Entity | Meaning |
|---|---|
| **Resource** | Anything access-controlled: page, feature, API, file, bot |
| **Approval** | Request + decision for gated access or payment |
| **Entitlement** | Durable grant of access to a Resource |

## Commerce plane

| Entity | Meaning |
|---|---|
| **Plan** | Pricing tier / catalog item |
| **Subscription** | Recurring plan binding |
| **Invoice** | Billing document |
| **Payment** | Single value-transfer event, rail-agnostic |

## Web3 plane (optional)

| Entity | Meaning |
|---|---|
| **Wallet** | On-chain address, scoped by `VMType` + `chainId` |
| **Contract** | Deployed smart contract |
| **Chain** | Blockchain network |
| **Token** | ERC20/SPL/BRC20/etc. asset |
| **Protocol** | Higher-order DeFi/infra product |

## Agent plane (optional)

| Entity | Meaning |
|---|---|
| **Agent** | Autonomous worker acting on behalf of user/org |
| **Service** | Callable endpoint agents consume (incl. x402) |

## Actor kinds

Every event may carry `provenance.actor_kind`:
`human | org | wallet | agent | service | system`.

This is how Web2 users, Web3 wallets, and agents share the same event shape
without leaking assumptions.

## Rails

`payment_*` events carry a `rail` field:
`fiat | stripe | invoice | onchain | x402 | internal_credit`.

Use rails to avoid "Web3 payment" vs "Web2 payment" bifurcation. A hybrid
company can emit `payment_completed` with `rail: 'stripe'` for fiat checkouts
and `rail: 'x402'` for agentic purchases, from the same codepath.
