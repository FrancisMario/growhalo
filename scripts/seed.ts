// ──────────────────────────────────────────
// Script: Seed — create demo tenant, connections, API key,
// and 90 days of mock raw events
// ──────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../src/db/connection';
import { TenantRepo } from '../src/platform/tenant';
import { ConnectionRepo } from '../src/platform/connection';
import { ApiKeyRepo, generateApiKey } from '../src/platform/auth';
import { CursorRepo } from '../src/domains/ingestion/polling/cursor.repo';
import { RawEventRepo } from '../src/domains/ingestion/raw-event.repo';
import { RawEventProcessor } from '../src/domains/modeling/processor';
import { OrderModel } from '../src/domains/modeling/models/order';
import { CustomerModel } from '../src/domains/modeling/models/customer';
import { AdSpendModel } from '../src/domains/modeling/models/ad-spend';
import { AggregationJob } from '../src/domains/analytics/aggregation.job';
import { DailySummaryRepo } from '../src/domains/analytics/daily-summary.repo';
import { RawEvent } from '../src/shared/types';

async function seed() {
  const db = getDb();
  console.log('[Seed] Starting...');

  // Run migrations
  console.log('[Seed] Running migrations...');
  await db.migrate.latest({
    directory: __dirname + '/../src/db/migrations',
    extension: 'ts',
  });

  // Clean slate — truncate all tables
  console.log('[Seed] Clearing existing data...');
  await db.raw('TRUNCATE TABLE daily_summaries, ad_spend, orders, customers, sync_cursors, raw_events, ingestion_batches, api_keys, connections, tenants CASCADE');

  // ── 1. Tenant ──
  const tenantRepo = new TenantRepo(db);
  const tenant = await tenantRepo.create({
    name: 'Demo Brand',
    slug: 'demo-brand',
    plan: 'growth',
    settings: { timezone: 'America/New_York', currency: 'USD', fiscalYearStart: 1 },
  });
  console.log(`[Seed] Created tenant: ${tenant.id}`);

  // ── 2. API Key ──
  const apiKeyRepo = new ApiKeyRepo(db);
  const { raw, hash } = generateApiKey();
  await apiKeyRepo.create({
    tenant_id: tenant.id,
    key_hash: hash,
    label: 'Development',
    scopes: ['ingest', 'read', 'admin'],
    expires_at: null,
  });
  console.log(`[Seed] Created API key: ${raw}`);

  // ── 3. Connections ──
  const connectionRepo = new ConnectionRepo(db);
  const shopifyConn = await connectionRepo.create({
    tenant_id: tenant.id,
    source: 'shopify',
    external_account_id: 'demo-brand.myshopify.com',
    credentials: { access_token: 'shpat_demo_token' },
    status: 'active',
    config: { webhookSecret: 'whsec_demo', pollInterval: 30000, syncSince: '2025-11-01' },
  });

  const metaConn = await connectionRepo.create({
    tenant_id: tenant.id,
    source: 'meta',
    external_account_id: 'act_123456789',
    credentials: { access_token: 'EAADemo_token' },
    status: 'active',
    config: { pollInterval: 60000 },
  });

  const googleConn = await connectionRepo.create({
    tenant_id: tenant.id,
    source: 'google',
    external_account_id: '123-456-7890',
    credentials: { refresh_token: 'demo_refresh_token' },
    status: 'active',
    config: { pollInterval: 60000 },
  });
  console.log('[Seed] Created 3 connections');

  // ── 4. Sync Cursors ──
  const cursorRepo = new CursorRepo(db);
  for (const conn of [shopifyConn, metaConn, googleConn]) {
    const eventTypes = conn.source === 'shopify'
      ? ['order', 'customer'] as const
      : ['ad_spend'] as const;

    for (const et of eventTypes) {
      await cursorRepo.create({
        connection_id: conn.id,
        tenant_id: tenant.id,
        event_type: et,
        cursor_field: 'updated_at',
        cursor_value: '',
        status: 'idle',
        next_sync_at: new Date(),
        error_count: 0,
        last_error: null,
      });
    }
  }
  console.log('[Seed] Created sync cursors');

  // ── 5. Generate raw events ──
  const now = new Date();
  const rawEvents: Partial<RawEvent>[] = [];

  // ~500 orders across 90 days
  const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Logan'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson'];
  const products = [
    { sku: 'TEE-001', name: 'Classic Tee', price: 29.99 },
    { sku: 'HOD-001', name: 'Pullover Hoodie', price: 59.99 },
    { sku: 'CAP-001', name: 'Snapback Cap', price: 24.99 },
    { sku: 'JKT-001', name: 'Bomber Jacket', price: 89.99 },
    { sku: 'BAG-001', name: 'Tote Bag', price: 34.99 },
  ];

  // Track customers for customer events
  const customerMap = new Map<string, { id: number; email: string; firstName: string; lastName: string; firstDate: Date; orders: number; revenue: number }>();

  for (let i = 0; i < 500; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;

    // Pick 1-3 line items
    const numItems = 1 + Math.floor(Math.random() * 3);
    const lineItems = [];
    let subtotal = 0;
    for (let j = 0; j < numItems; j++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const qty = 1 + Math.floor(Math.random() * 3);
      lineItems.push({
        sku: product.sku,
        name: product.name,
        title: product.name,
        price: String(product.price),
        quantity: qty,
      });
      subtotal += product.price * qty;
    }

    const discount = Math.random() < 0.3 ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const tax = Math.round((subtotal - discount) * 0.08 * 100) / 100;
    const total = Math.round((subtotal - discount + tax) * 100) / 100;

    const orderId = 1000 + i;
    rawEvents.push({
      tenant_id: tenant.id,
      connection_id: shopifyConn.id,
      source: 'shopify',
      event_type: 'order',
      external_id: String(orderId),
      idempotency_key: `shopify:order:${orderId}`,
      payload: {
        id: orderId,
        email,
        created_at: date.toISOString(),
        subtotal_price: String(subtotal),
        total_discounts: String(discount),
        total_tax: String(tax),
        total_price: String(total),
        currency: 'USD',
        line_items: lineItems,
        customer: { email, first_name: fn, last_name: ln },
      },
      status: 'accepted',
      source_timestamp: date,
    });

    // Track customer
    const custKey = email;
    if (!customerMap.has(custKey)) {
      customerMap.set(custKey, { id: customerMap.size + 1, email, firstName: fn, lastName: ln, firstDate: date, orders: 0, revenue: 0 });
    }
    const c = customerMap.get(custKey)!;
    c.orders++;
    c.revenue += total;
    if (date < c.firstDate) c.firstDate = date;
  }

  // ~200 customer records
  let custCount = 0;
  for (const [, c] of customerMap) {
    if (custCount >= 200) break;
    rawEvents.push({
      tenant_id: tenant.id,
      connection_id: shopifyConn.id,
      source: 'shopify',
      event_type: 'customer',
      external_id: String(c.id),
      idempotency_key: `shopify:customer:${c.id}`,
      payload: {
        id: c.id,
        email: c.email,
        first_name: c.firstName,
        last_name: c.lastName,
        created_at: c.firstDate.toISOString(),
        orders_count: c.orders,
        total_spent: String(Math.round(c.revenue * 100) / 100),
      },
      status: 'accepted',
      source_timestamp: c.firstDate,
    });
    custCount++;
  }

  // 90 days of Meta ad spend
  const metaCampaigns = [
    { id: 'meta_camp_1', name: 'Retargeting - Lookalike' },
    { id: 'meta_camp_2', name: 'Prospecting - Broad' },
    { id: 'meta_camp_3', name: 'Brand Awareness' },
  ];

  for (let d = 0; d < 90; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    for (const camp of metaCampaigns) {
      const spend = 50 + Math.random() * 150;
      const impressions = 5000 + Math.floor(Math.random() * 20000);
      const clicks = Math.floor(impressions * (0.01 + Math.random() * 0.04));

      rawEvents.push({
        tenant_id: tenant.id,
        connection_id: metaConn.id,
        source: 'meta',
        event_type: 'ad_spend',
        external_id: `${camp.id}:${dateStr}`,
        idempotency_key: `meta:ad_spend:${camp.id}:${dateStr}`,
        payload: {
          campaign_id: camp.id,
          campaign_name: camp.name,
          spend: String(Math.round(spend * 100) / 100),
          impressions,
          clicks,
          date_start: dateStr,
        },
        status: 'accepted',
        source_timestamp: date,
      });
    }
  }

  // 90 days of Google ad spend
  const googleCampaigns = [
    { id: 'goog_camp_1', name: 'Search - Brand Terms' },
    { id: 'goog_camp_2', name: 'Search - Non-Brand' },
  ];

  for (let d = 0; d < 90; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - d);
    const dateStr = date.toISOString().slice(0, 10);

    for (const camp of googleCampaigns) {
      const spend = 30 + Math.random() * 100;
      const impressions = 3000 + Math.floor(Math.random() * 15000);
      const clicks = Math.floor(impressions * (0.02 + Math.random() * 0.05));

      rawEvents.push({
        tenant_id: tenant.id,
        connection_id: googleConn.id,
        source: 'google',
        event_type: 'ad_spend',
        external_id: `${camp.id}:${dateStr}`,
        idempotency_key: `google:ad_spend:${camp.id}:${dateStr}`,
        payload: {
          campaign_id: camp.id,
          campaign_name: camp.name,
          amount: String(Math.round(spend * 100) / 100),
          impressions,
          clicks,
          date: dateStr,
        },
        status: 'accepted',
        source_timestamp: date,
      });
    }
  }

  // Bulk insert raw events
  console.log(`[Seed] Inserting ${rawEvents.length} raw events...`);
  const rawEventRepo = new RawEventRepo(db);
  // Insert in batches of 200 to avoid query size limits
  for (let i = 0; i < rawEvents.length; i += 200) {
    const batch = rawEvents.slice(i, i + 200);
    await rawEventRepo.insert(batch);
  }

  // ── 6. Process raw → clean ──
  console.log('[Seed] Processing raw events into clean models...');
  const orderModel = new OrderModel(db);
  const customerModel = new CustomerModel(db);
  const adSpendModel = new AdSpendModel(db);
  const processor = new RawEventProcessor(db, rawEventRepo, orderModel, customerModel, adSpendModel);

  // Process all events (run multiple times to get through all)
  let processed = true;
  while (processed) {
    const before = await db('raw_events').whereNull('processed_at').where('status', 'accepted').count('* as count').first();
    const count = Number(before?.count || 0);
    if (count === 0) break;
    await processor.run();
    processed = count > 0;
  }

  // ── 7. Aggregate into daily summaries ──
  console.log('[Seed] Aggregating into daily summaries...');
  const summaryRepo = new DailySummaryRepo(db);
  const tenantRepoForAgg = new TenantRepo(db);
  const aggregation = new AggregationJob(db, processor, summaryRepo, tenantRepoForAgg);

  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 90);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(now);
  endDate.setUTCHours(0, 0, 0, 0);

  await aggregation.runForDateRange(tenant.id, startDate, endDate);

  // Summary
  const orderCount = await db('orders').where('tenant_id', tenant.id).count('* as count').first();
  const customerCount = await db('customers').where('tenant_id', tenant.id).count('* as count').first();
  const adSpendCount = await db('ad_spend').where('tenant_id', tenant.id).count('* as count').first();
  const summaryCount = await db('daily_summaries').where('tenant_id', tenant.id).count('* as count').first();

  console.log(`\n[Seed] ✅ Done!`);
  console.log(`  Tenant:           ${tenant.name} (${tenant.id})`);
  console.log(`  API Key:          ${raw}`);
  console.log(`  Orders:           ${orderCount?.count}`);
  console.log(`  Customers:        ${customerCount?.count}`);
  console.log(`  Ad Spend Records: ${adSpendCount?.count}`);
  console.log(`  Daily Summaries:  ${summaryCount?.count}`);
  console.log(`\n  Test with:`);
  console.log(`  curl -H "x-api-key: ${raw}" "localhost:3000/api/v1/metrics/summary?period=last_30_days"`);
  console.log(`\n  Dashboard:`);
  console.log(`  GROWHALO_API_KEY=${raw} npx tsx dashboard/server.ts\n`);

  // Write key to .api_key for convenience
  const fs = await import('fs');
  fs.writeFileSync(__dirname + '/../.api_key', raw);

  await closeDb();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
