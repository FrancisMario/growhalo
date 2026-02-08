// ──────────────────────────────────────────
// Simulator: generates fake events and pushes them through
// the ingestion pipeline, plus serves mock polling endpoints.
//
// Usage:
//   GROWHALO_API_KEY=ghk_xxx npx tsx scripts/simulator.ts
//
// Env vars:
//   GROWHALO_API_KEY   — required, the raw API key
//   API_BASE           — default http://localhost:3000
//   SIMULATOR_PORT     — default 3002
//   PUSH_INTERVAL_MS   — default 5000 (5s between push cycles)
//   EVENTS_PER_PUSH    — default 4  (events per cycle)
// ──────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

// ── Config ──────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const SIMULATOR_PORT = parseInt(process.env.SIMULATOR_PORT || '3002', 10);
const PUSH_INTERVAL_MS = parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);
const EVENTS_PER_PUSH = parseInt(process.env.EVENTS_PER_PUSH || '4', 10);

// Resolve API key: env var → .api_key file
let API_KEY = process.env.GROWHALO_API_KEY || '';
if (!API_KEY) {
  try {
    API_KEY = fs.readFileSync(path.join(__dirname, '..', '.api_key'), 'utf-8').trim();
  } catch {}
}
if (!API_KEY) {
  console.error('❌  Set GROWHALO_API_KEY or run seed first (writes .api_key)');
  process.exit(1);
}

// ── Shared state ────────────────────────────────────────────────────

let orderSeq = 10_000;
const customerPool: Array<{
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}> = [];

// Accumulate events so polling endpoints have data to serve
const pollStore = {
  metaInsights: [] as Record<string, unknown>[],
  googleReports: [] as Record<string, unknown>[],
};

// ── Products catalog ────────────────────────────────────────────────

const PRODUCTS = [
  'Vitamin C Serum', 'Hyaluronic Moisturizer', 'Retinol Night Cream',
  'SPF 50 Sunscreen', 'Gentle Foaming Cleanser', 'Niacinamide Toner',
  'Eye Repair Cream', 'Peptide Booster', 'AHA Exfoliant', 'Lip Balm',
  'Body Butter', 'Hair Growth Oil', 'Collagen Mask', 'Tea Tree Spot Gel',
];

const META_CAMPAIGNS = [
  { id: 'meta_camp_retarget', name: 'Retargeting — Cart Abandoners' },
  { id: 'meta_camp_lookalike', name: 'Lookalike — Top Buyers' },
  { id: 'meta_camp_brand', name: 'Brand Awareness — Video' },
  { id: 'meta_camp_summer', name: 'Summer Sale Push' },
];

const GOOGLE_CAMPAIGNS = [
  { id: 'goog_camp_brand', name: 'Search — Brand Terms' },
  { id: 'goog_camp_nonbrand', name: 'Search — Non-Brand' },
  { id: 'goog_camp_shopping', name: 'Shopping — All Products' },
];

// ── Helpers ─────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOrCreateCustomer() {
  if (customerPool.length > 10 && Math.random() < 0.6) {
    return pick(customerPool);
  }
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const customer = {
    id: faker.number.int({ min: 10_000, max: 99_999 }),
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    firstName,
    lastName,
  };
  customerPool.push(customer);
  if (customerPool.length > 150) customerPool.splice(0, 50);
  return customer;
}

// ── Event generators ────────────────────────────────────────────────

function shopifyOrder(): Record<string, unknown> {
  const customer = getOrCreateCustomer();
  const numItems = faker.number.int({ min: 1, max: 4 });
  const lineItems = Array.from({ length: numItems }, () => {
    const qty = faker.number.int({ min: 1, max: 3 });
    const price = parseFloat(faker.commerce.price({ min: 12, max: 180 }));
    return {
      id: faker.number.int({ min: 100_000, max: 999_999 }),
      title: pick(PRODUCTS),
      name: pick(PRODUCTS),
      sku: `SKU-${faker.string.alphanumeric(6).toUpperCase()}`,
      quantity: qty,
      price: price.toFixed(2),
    };
  });

  const subtotal = lineItems.reduce(
    (s, li) => s + parseFloat(li.price as string) * (li.quantity as number), 0
  );
  const discount = Math.random() < 0.3 ? +(subtotal * 0.1).toFixed(2) : 0;
  const tax = +((subtotal - discount) * 0.08).toFixed(2);
  const total = +(subtotal - discount + tax).toFixed(2);

  orderSeq++;
  return {
    id: orderSeq,
    order_number: orderSeq,
    email: customer.email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    financial_status: faker.helpers.arrayElement(['paid', 'partially_refunded']),
    fulfillment_status: faker.helpers.arrayElement([null, 'fulfilled', 'partial']),
    subtotal_price: subtotal.toFixed(2),
    total_discounts: discount.toFixed(2),
    total_tax: tax.toFixed(2),
    total_price: total.toFixed(2),
    currency: 'USD',
    line_items: lineItems,
    customer: {
      id: customer.id,
      email: customer.email,
      first_name: customer.firstName,
      last_name: customer.lastName,
    },
    shipping_address: {
      city: faker.location.city(),
      province: faker.location.state(),
      country: 'US',
      zip: faker.location.zipCode(),
    },
  };
}

function shopifyCustomer(): Record<string, unknown> {
  const customer = getOrCreateCustomer();
  return {
    id: customer.id,
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    orders_count: faker.number.int({ min: 0, max: 12 }),
    total_spent: faker.commerce.price({ min: 0, max: 2000 }),
    tags: faker.helpers.arrayElements(
      ['vip', 'wholesale', 'returning', 'new'], { min: 0, max: 2 }
    ).join(', '),
  };
}

function metaAdInsight(): Record<string, unknown> {
  const campaign = pick(META_CAMPAIGNS);
  const dateStr = new Date().toISOString().slice(0, 10);
  const spend = parseFloat(faker.finance.amount({ min: 30, max: 400, dec: 2 }));
  const impressions = faker.number.int({ min: 2000, max: 50000 });
  const clicks = faker.number.int({ min: 50, max: Math.min(2000, impressions) });

  const insight: Record<string, unknown> = {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    date_start: dateStr,
    date_stop: dateStr,
    spend: spend.toFixed(2),
    impressions,
    clicks,
    actions: [
      { action_type: 'purchase', value: faker.number.int({ min: 1, max: 15 }) },
      { action_type: 'add_to_cart', value: faker.number.int({ min: 5, max: 40 }) },
    ],
  };

  pollStore.metaInsights.push(insight);
  if (pollStore.metaInsights.length > 200) pollStore.metaInsights.splice(0, 100);
  return insight;
}

function googleAdMetric(): Record<string, unknown> {
  const campaign = pick(GOOGLE_CAMPAIGNS);
  const dateStr = new Date().toISOString().slice(0, 10);
  const spend = parseFloat(faker.finance.amount({ min: 20, max: 350, dec: 2 }));
  const impressions = faker.number.int({ min: 1000, max: 35000 });
  const clicks = faker.number.int({ min: 30, max: Math.min(1500, impressions) });

  const metric: Record<string, unknown> = {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    cost_micros: String(Math.round(spend * 1_000_000)),
    amount: spend.toFixed(2),
    impressions,
    clicks,
    date: dateStr,
  };

  pollStore.googleReports.push(metric);
  if (pollStore.googleReports.length > 200) pollStore.googleReports.splice(0, 100);
  return metric;
}

// ── Push loop ───────────────────────────────────────────────────────

type SourceEvent = { source: string; eventType: string; generator: () => Record<string, unknown> };

const EVENT_TYPES: SourceEvent[] = [
  { source: 'shopify', eventType: 'order', generator: shopifyOrder },
  { source: 'shopify', eventType: 'order', generator: shopifyOrder },   // 2× weight
  { source: 'shopify', eventType: 'customer', generator: shopifyCustomer },
  { source: 'meta', eventType: 'ad_spend', generator: metaAdInsight },
  { source: 'google', eventType: 'ad_spend', generator: googleAdMetric },
];

async function pushCycle(): Promise<void> {
  // Generate events
  const picks: SourceEvent[] = [];
  for (let i = 0; i < EVENTS_PER_PUSH; i++) {
    picks.push(pick(EVENT_TYPES));
  }

  // Group by source for batch upload
  const grouped = new Map<string, Array<{ eventType: string; payload: Record<string, unknown>; sourceTimestamp: Date }>>();
  for (const p of picks) {
    const payload = p.generator();
    if (!grouped.has(p.source)) grouped.set(p.source, []);
    grouped.get(p.source)!.push({
      eventType: p.eventType,
      payload,
      sourceTimestamp: new Date(),
    });
  }

  for (const [source, events] of grouped) {
    try {
      const res = await fetch(`${API_BASE}/api/v1/ingest/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({ source, events }),
      });
      const body = await res.json() as Record<string, unknown>;
      if (res.ok) {
        const batchId = (body.id as string || '').slice(0, 8);
        console.log(
          `  ✓ ${source.padEnd(7)} ${events.length} events → batch ${batchId}… ` +
          `(accepted: ${body.accepted}, dupes: ${body.duplicates})`
        );
      } else {
        console.error(`  ✗ ${source}: ${res.status}`, body);
      }
    } catch (err: unknown) {
      console.error(`  ✗ ${source}: ${(err as Error).message}`);
    }
  }
}

// ── Polling server (mock Shopify / Meta / Google APIs) ──────────────

const pollApp = express();
pollApp.use(express.json());

// Meta Marketing API — GET /:accountId/insights
pollApp.get('/:accountId/insights', (req, res) => {
  const since = (req.query.since as string) || '2000-01-01';
  const data = pollStore.metaInsights.filter(
    (i) => (i.date_start as string) >= since
  );
  console.log(`  📡 Meta poll → ${data.length} insights (since=${since})`);
  res.json({ data, paging: {} });
});

// Google Ads API — POST /google/:customerId/searchStream
pollApp.post('/google/:customerId/searchStream', (req, res) => {
  const results = pollStore.googleReports.slice(-50);
  console.log(`  📡 Google poll → ${results.length} metrics`);
  res.json([{ results }]);
});

// Health
pollApp.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    customers: customerPool.length,
    metaInsights: pollStore.metaInsights.length,
    googleReports: pollStore.googleReports.length,
  });
});

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           🧪  Grow Halo Event Simulator             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  API target:    ${API_BASE.padEnd(37)}║`);
  console.log(`║  Push interval: ${(PUSH_INTERVAL_MS / 1000 + 's').padEnd(37)}║`);
  console.log(`║  Events/push:   ${String(EVENTS_PER_PUSH).padEnd(37)}║`);
  console.log(`║  Poll server:   http://localhost:${SIMULATOR_PORT}${' '.repeat(20 - String(SIMULATOR_PORT).length)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Start mock polling server
  pollApp.listen(SIMULATOR_PORT, () => {
    console.log(`📡 Mock polling server on http://localhost:${SIMULATOR_PORT}`);
  });

  // Wait a moment then start push loop
  console.log(`📤 Pushing ${EVENTS_PER_PUSH} events every ${PUSH_INTERVAL_MS / 1000}s to ${API_BASE}\n`);

  // Immediate first push
  const ts = () => new Date().toISOString().split('T')[1].split('.')[0];

  const cycle = async () => {
    console.log(`[${ts()}] ── push cycle ──`);
    await pushCycle();
  };

  await cycle();
  setInterval(cycle, PUSH_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Simulator failed:', err);
  process.exit(1);
});
