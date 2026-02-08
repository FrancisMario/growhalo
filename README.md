# 🌟 Grow Halo

A e-commerce analytics platform. Ingests raw event data from **Shopify**, **Meta Ads**, and **Google Ads** — normalizes it into clean models, aggregates daily summaries, and serves business metrics through a REST API. Includes a real-time dashboard UI.

## Why

DTC brands pull data from multiple platforms but lack a unified view of core metrics — revenue, ROAS, CAC, AOV — with period-over-period trends. Grow Halo acts as the analytics backend: one webhook/polling endpoint per source, one set of normalized tables, one metrics API.

## Features

- **Multi-tenant** — tenant-scoped via `AsyncLocalStorage`; every query is isolated by `tenant_id`
- **Three sources** — Shopify (orders/customers), Meta Ads (ad spend), Google Ads (ad spend)
- **Dual ingestion** — push via webhooks / batch API, pull via polling with cursor-based sync
- **Deduplication** — `ON CONFLICT (tenant_id, source, external_id)` in `raw_events`
- **Three-stage pipeline** — Ingest → Model → Aggregate, each running on background intervals
- **Derived metrics** — revenue, orders, new customers, ad spend, ROAS, CAC, AOV
- **Period-over-period** — summary endpoint computes % change vs. prior period automatically
- **Time-series** — daily / weekly / monthly bucketing with re-derived metrics per bucket
- **Ad spend breakdown** — group by source (platform) with % of total
- **Dashboard UI** — dark-theme SPA with Chart.js, proxied through a lightweight Express server
- **API key auth** — SHA-256 hashed keys with `ingest` / `read` / `admin` scopes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL 16 |
| Query builder | Knex |
| Dev runner | tsx (esbuild) |
| Charts | Chart.js 4.4 (CDN) |
| Container | Docker Compose |

## Quick Start

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create .env
cp .env.example .env

# 4. Run migrations (creates 10 tables)
npm run migrate

# 5. Seed demo data (90 days, ~1150 raw events → processed through the pipeline)
npm run seed
#    → prints your API key (ghk_xxx) and writes it to .api_key

# 6. Start the API server (port 3000) — runs background jobs automatically
npm run dev
```

### Live demo (3 terminals)

```bash
# Terminal 1 — API server + background jobs
npm run dev

# Terminal 2 — Event simulator (pushes faker-generated events every 5s)
npm run simulator

# Terminal 3 — Dashboard UI
npm run dashboard
```

Open **http://localhost:3001** — watch metrics update in real-time as events flow through the pipeline.

## API Endpoints

All endpoints require an `x-api-key` header.

### Metrics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/metrics/summary?period=last_30_days` | Dashboard summary with current values + % changes vs prior period. Periods: `last_7_days`, `last_30_days`, `last_90_days` |
| `GET` | `/api/v1/metrics?start=YYYY-MM-DD&end=YYYY-MM-DD&granularity=daily&metrics=revenue,roas` | Time-series. Granularity: `daily`, `weekly`, `monthly`. Metrics: `revenue`, `orders_count`, `new_customers`, `ad_spend`, `roas`, `cac`, `avg_order_value` |
| `GET` | `/api/v1/metrics/ad-spend?start=YYYY-MM-DD&end=YYYY-MM-DD&group_by=source` | Ad spend breakdown by platform with ROAS and % of total |
| `POST` | `/api/v1/metrics/aggregate` | Force re-aggregation (admin scope). Body: `{ "start_date": "...", "end_date": "..." }` |

### Ingestion

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/ingest/batch` | Bulk upload events. Body: `{ "source": "shopify", "events": [...] }` |
| `POST` | `/api/v1/ingest/webhook/:source` | Webhook receiver (`shopify`, `meta`, `google`) |
| `GET`  | `/api/v1/ingest/status` | Ingestion pipeline status (cursors, pending events) |
| `GET`  | `/api/v1/ingest/connections` | List connections for tenant |
| `POST` | `/api/v1/ingest/connections` | Create a new source connection |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API server with hot reload + background jobs (processor 30s, aggregation 60s, polling 30s) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled app (production) |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed 90 days of demo data through the full pipeline (~1150 raw events → orders, customers, ad spend, daily summaries) |
| `npm run reset` | Drop all tables and re-migrate |
| `npm run simulator` | Start the event simulator — pushes faker-generated Shopify/Meta/Google events to the ingestion API every 5s, plus serves mock polling endpoints on port 3002 |
| `npm run simulate:webhook` | Send a single test Shopify webhook |
| `npm run dashboard` | Start the dashboard UI on port 3001 (auto-reads `.api_key` file, or set `GROWHALO_API_KEY` env var) |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Express App                       │
│   API key auth → AsyncLocalStorage (tenant scope)    │
├──────────┬──────────────┬────────────────────────────┤
│          │              │                            │
│  Ingestion        Modeling            Analytics      │
│  ─────────        ────────            ─────────      │
│  Webhooks         Order transformer   Daily summary  │
│  Batch API        Customer xformer    Aggregation    │
│  Polling          Ad-spend xformer    Metrics API    │
│  Source adapters   Model upserts      Time-series    │
│  Raw event repo   RawEventProcessor   Ad breakdown   │
│          │              │                            │
├──────────┴──────────────┴────────────────────────────┤
│                   PostgreSQL                         │
│  tenants · connections · api_keys · raw_events       │
│  sync_cursors · orders · customers · ad_spend        │
│  daily_summaries                                     │
└──────────────────────────────────────────────────────┘
```

### Data flow

```
Simulator (port 3002)                          Dashboard (port 3001)
  │ faker-generated events                         ↑ Chart.js SPA
  │                                                │
  ▼                                                │
┌─ API Server (port 3000) ─────────────────────────┤
│                                                  │
│  POST /ingest/batch ──→ raw_events (deduped)     │
│                              │                   │
│                    [Processor 30s]               │
│                              ↓                   │
│                     orders / customers /          │
│                     ad_spend (clean)             │
│                              │                   │
│                   [Aggregation 60s]              │
│                              ↓                   │
│                     daily_summaries ──→ GET /metrics
│                                                  │
└──────────────────────────────────────────────────┘
```

### Database tables (10)

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant registry |
| `connections` | Source connections (Shopify store, Meta ad account, etc.) |
| `api_keys` | SHA-256 hashed keys with scopes |
| `ingestion_batches` | Batch metadata for each ingest call |
| `raw_events` | Immutable raw payloads, deduped |
| `sync_cursors` | Polling cursor state per connection |
| `orders` | Clean order data with JSONB line items |
| `customers` | Customer records with first/last order dates |
| `ad_spend` | Daily ad spend per campaign |
| `daily_summaries` | Pre-aggregated daily metrics per tenant |

### Project structure

```
src/
  app.ts                        # Express bootstrap + wiring
  runtime.ts                    # Background job scheduler
  db/
    connection.ts               # Knex instance
    knexfile.ts                 # Knex config
    migrations/                 # Schema migrations
  domains/
    ingestion/                  # Raw event ingestion
      adapters/                 #   Shopify, Meta, Google normalizers
      polling/                  #   Cursor-based polling orchestrator
    modeling/                   # Raw → clean transformation
      models/                   #   Order, Customer, AdSpend upserts
      transformers/             #   Payload → model mappers
    analytics/                  # Aggregation + metrics API
  platform/                     # Multi-tenant infrastructure
    auth.ts                     #   API key generation, hashing, middleware
    context.ts                  #   AsyncLocalStorage tenant scope
    connection.ts               #   Connection repo
    tenant.ts                   #   Tenant repo
    scoped.ts                   #   Scoped query helper
  shared/
    types.ts                    # Shared type definitions
    contracts.ts                # Domain boundary interfaces
    errors.ts                   # Custom error classes
scripts/
  seed.ts                       # Demo data seeder (inserts through raw_events → pipeline processes them)
  simulator.ts                  # Live event simulator with @faker-js/faker + mock polling server
  reset.ts                      # Database reset
  simulate-webhook.ts           # Test webhook sender
dashboard/
  server.ts                     # Proxy server (port 3001, auto-reads .api_key)
  index.html                    # SPA dashboard with Chart.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://growhalo:growhalo@localhost:5432/growhalo` | PostgreSQL connection string |
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | Environment |
| `GROWHALO_API_KEY` | — | Raw API key (auto-read from `.api_key` file by dashboard and simulator) |
| `SIMULATOR_PORT` | `3002` | Mock polling server port |
| `PUSH_INTERVAL_MS` | `5000` | Simulator push interval in milliseconds |
| `EVENTS_PER_PUSH` | `4` | Number of events the simulator generates per push cycle |

## License

ISC

## Tech Stack

- Node.js + TypeScript
- Express
- PostgreSQL + Knex
- Docker Compose (Postgres)
