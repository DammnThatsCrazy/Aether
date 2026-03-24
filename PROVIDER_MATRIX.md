# Aether Provider Matrix

## Implemented Providers (16 total)

| Provider | Category | Auth Mode | Env Var | Base URL | Rate Limit | Status |
|----------|----------|-----------|---------|----------|-----------|--------|
| **QuickNode** | Blockchain RPC | API key header | `QUICKNODE_API_KEY` | Custom per-account | 100 RPS | ✅ Implemented |
| **Alchemy** | Blockchain RPC | Key in URL | `ALCHEMY_API_KEY` | `{chain}.g.alchemy.com/v2/{key}` | 330 CU/s | ✅ Implemented |
| **Infura** | Blockchain RPC | Key in URL | `INFURA_API_KEY` | `{network}.infura.io/v3/{key}` | 100K req/day | ✅ Implemented |
| **Generic RPC** | Blockchain RPC | Bearer token | `CUSTOM_RPC_KEY` | Custom | Varies | ✅ Implemented |
| **Etherscan** | Block Explorer | Query param | `ETHERSCAN_API_KEY` | `api.etherscan.io` | 5 req/s | ✅ Implemented |
| **Moralis** | Block Explorer | Header | `MORALIS_API_KEY` | `deep-index.moralis.io` | 25 req/s | ✅ Implemented |
| **Twitter/X** | Social | Bearer token | `TWITTER_BEARER_TOKEN` | `api.twitter.com/2` | 500K tweets/mo | ✅ Implemented |
| **Reddit** | Social | OAuth bearer | `REDDIT_API_KEY` | `oauth.reddit.com` | 60 req/min | ✅ Implemented |
| **Dune Analytics** | Analytics | Header | `DUNE_API_KEY` | `api.dune.com/api/v1` | Varies by plan | ✅ Implemented |
| **DeFiLlama** | Market Data | None (public) | — | `api.llama.fi` | ~300 req/5min | ✅ Implemented |
| **CoinGecko** | Market Data | Header (optional) | `COINGECKO_API_KEY` | `api.coingecko.com/api/v3` | 30 req/min (free) | ✅ Implemented |
| **Binance** | CEX Data | Header | `BINANCE_API_KEY` | `api.binance.com/api/v3` | 1200 req/min | ✅ Implemented |
| **Coinbase** | CEX Data | Header | `COINBASE_API_KEY` | `api.coinbase.com/v2` | 10K req/hr | ✅ Implemented |
| **Polymarket** | Prediction Mkt | Bearer (optional) | `POLYMARKET_API_KEY` | `gamma-api.polymarket.com` | Rate limited | ✅ Implemented |
| **Kalshi** | Prediction Mkt | Bearer | `KALSHI_API_KEY` | `trading-api.kalshi.com` | Rate limited | ✅ Implemented |
| **Farcaster** | Web3 Social | Header | `FARCASTER_API_KEY` | `api.neynar.com/v2/farcaster` | Varies by plan | ✅ Implemented |

## Planned Providers (Not Yet Implemented)

| Provider | Category | Priority | Blocked By |
|----------|----------|----------|-----------|
| Lens Protocol | Web3 Social | P2 | Implementation needed |
| GitHub | Developer | P2 | Implementation needed |
| Chainalysis | On-chain Intel | P3 | Contract + implementation |
| Nansen | On-chain Intel | P3 | Contract + implementation |
| Massive | TradFi | P3 | Contract + implementation |
| Databento | TradFi | P3 | Contract + implementation |
| Snapshot | Governance | P3 | Implementation needed |
| The Graph | Indexing | P3 | Implementation needed |

## Provider Health States

Every provider reports one of:
- `healthy` — credentials present, API reachable
- `degraded` — API reachable but experiencing errors
- `unavailable` — credentials missing or API unreachable
- `not_configured` — no env var set for this provider

## Adding a New Provider

1. Create class extending `Provider` in `shared/providers/categories.py`
2. Implement `execute()` with real httpx calls
3. Implement `health_check()` returning `ProviderStatus`
4. Add to `PROVIDER_FACTORY` dict
5. Add to `CATEGORY_PROVIDERS` mapping
6. Add env var to `.env.example`
7. Document in this matrix
