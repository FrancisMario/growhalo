// ──────────────────────────────────────────
// Script: Simulate webhook — send a test webhook payload
// to the local ingestion endpoint
// ──────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;

async function simulateWebhook() {
  console.log('[SimulateWebhook] Sending test Shopify order webhook...');

  const order = {
    id: 99001,
    email: 'webhook.test@example.com',
    created_at: new Date().toISOString(),
    subtotal_price: '79.98',
    total_discounts: '0.00',
    total_tax: '6.40',
    total_price: '86.38',
    currency: 'USD',
    line_items: [
      { sku: 'TEE-001', name: 'Classic Tee', title: 'Classic Tee', price: '29.99', quantity: 1 },
      { sku: 'HOD-001', name: 'Pullover Hoodie', title: 'Pullover Hoodie', price: '49.99', quantity: 1 },
    ],
    customer: {
      email: 'webhook.test@example.com',
      first_name: 'Webhook',
      last_name: 'Test',
    },
  };

  const resp = await fetch(`${BASE}/api/v1/ingest/webhook/shopify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-shop-domain': 'demo-brand.myshopify.com',
    },
    body: JSON.stringify(order),
  });

  const data = await resp.json();
  console.log(`[SimulateWebhook] Response (${resp.status}):`, JSON.stringify(data, null, 2));

  // Also test a Meta ad spend webhook
  console.log('\n[SimulateWebhook] Sending test Meta ad-spend webhook...');

  const metaPayload = {
    campaign_id: 'meta_camp_test',
    campaign_name: 'Webhook Test Campaign',
    spend: '75.50',
    impressions: 10000,
    clicks: 350,
    date_start: new Date().toISOString().slice(0, 10),
  };

  const metaResp = await fetch(`${BASE}/api/v1/ingest/webhook/meta`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-account-id': 'act_123456789',
    },
    body: JSON.stringify(metaPayload),
  });

  const metaData = await metaResp.json();
  console.log(`[SimulateWebhook] Response (${metaResp.status}):`, JSON.stringify(metaData, null, 2));

  console.log('\n[SimulateWebhook] ✅ Done');
}

simulateWebhook().catch((err) => {
  console.error('[SimulateWebhook] Error:', err);
  process.exit(1);
});
