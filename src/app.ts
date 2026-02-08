// ──────────────────────────────────────────
// App entry point — bootstrap + Express server
// ──────────────────────────────────────────
// TODO: Implement — follows bootstrap order from spec:
// 1. Connect to Postgres
// 2. Run migrations
// 3. Instantiate platform repos
// 4. Instantiate domains with contract injection
// 5. Mount routes with auth middleware
// 6. Start runtime intervals
// 7. Listen on port

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { getDb, closeDb } from './db/connection';

// Platform
import { TenantRepo } from './platform/tenant';
import { ConnectionRepo } from './platform/connection';
import { ApiKeyRepo, apiKeyAuth } from './platform/auth';

// Ingestion
import { RawEventRepo } from './domains/ingestion/raw-event.repo';
import { IngestionService } from './domains/ingestion/ingestion.service';
import { CursorRepo } from './domains/ingestion/polling/cursor.repo';
import { PollOrchestrator } from './domains/ingestion/polling/orchestrator';
import { createIngestionRoutes } from './domains/ingestion/routes';

// Modeling
import { OrderModel } from './domains/modeling/models/order';
import { CustomerModel } from './domains/modeling/models/customer';
import { AdSpendModel } from './domains/modeling/models/ad-spend';
import { RawEventProcessor } from './domains/modeling/processor';

// Analytics
import { DailySummaryRepo } from './domains/analytics/daily-summary.repo';
import { AggregationJob } from './domains/analytics/aggregation.job';
import { MetricsService } from './domains/analytics/metrics.service';
import { createAnalyticsRoutes } from './domains/analytics/routes';

// Runtime
import { Runtime } from './runtime';

async function main() {
  const db = getDb();
  const port = process.env.PORT || 3000;

  // ── Platform ──
  const tenantRepo = new TenantRepo(db);
  const connectionRepo = new ConnectionRepo(db);
  const apiKeyRepo = new ApiKeyRepo(db);

  // ── Ingestion ──
  const rawEventRepo = new RawEventRepo(db);
  const ingestionService = new IngestionService(db, rawEventRepo);
  const cursorRepo = new CursorRepo(db);
  const pollOrchestrator = new PollOrchestrator(db, cursorRepo, ingestionService);

  // ── Modeling ──
  const orderModel = new OrderModel(db);
  const customerModel = new CustomerModel(db);
  const adSpendModel = new AdSpendModel(db);
  const rawEventProcessor = new RawEventProcessor(db, rawEventRepo, orderModel, customerModel, adSpendModel);

  // ── Analytics ──
  const summaryRepo = new DailySummaryRepo(db);
  const aggregationJob = new AggregationJob(db, rawEventProcessor, summaryRepo, tenantRepo);
  const metricsService = new MetricsService(summaryRepo);

  // ── Runtime ──
  const runtime = new Runtime(pollOrchestrator, rawEventProcessor, aggregationJob);

  // ── Express app ──
  const app = express();
  app.use(express.json());

  // Mount routes
  app.use('/api/v1/ingest', apiKeyAuth(apiKeyRepo, 'ingest'), createIngestionRoutes(ingestionService, cursorRepo, connectionRepo));
  app.use('/api/v1/metrics', apiKeyAuth(apiKeyRepo, 'read'), createAnalyticsRoutes(metricsService, aggregationJob));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Start
  runtime.start();
  app.listen(port, () => {
    console.log(`[App] Grow Halo listening on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[App] Shutting down...');
    runtime.stop();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[App] Fatal error:', err);
  process.exit(1);
});
