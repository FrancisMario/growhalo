// ──────────────────────────────────────────
// Migration: create all tables
// ──────────────────────────────────────────

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Platform tables ──

  await knex.schema.createTable('tenants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('slug', 100).unique().notNullable();
    t.string('plan', 20).notNullable().defaultTo('starter');
    t.jsonb('settings').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('connections', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('source', 20).notNullable();
    t.string('external_account_id', 255).notNullable();
    t.jsonb('credentials').notNullable().defaultTo('{}');
    t.string('status', 20).notNullable().defaultTo('active');
    t.jsonb('config').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['source', 'external_account_id']);
  });

  await knex.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('key_hash', 255).unique().notNullable();
    t.string('label', 100).notNullable();
    t.specificType('scopes', 'text[]').notNullable();
    t.timestamp('last_used', { useTz: true });
    t.timestamp('expires_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Ingestion tables ──

  await knex.schema.createTable('ingestion_batches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('source', 20).notNullable();
    t.integer('total_events').notNullable().defaultTo(0);
    t.integer('accepted').notNullable().defaultTo(0);
    t.integer('rejected').notNullable().defaultTo(0);
    t.integer('duplicates').notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('processing');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true });
  });

  await knex.schema.createTable('raw_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('connection_id').references('id').inTable('connections').onDelete('SET NULL');
    t.string('source', 20).notNullable();
    t.string('event_type', 20).notNullable();
    t.string('external_id', 255).notNullable();
    t.string('idempotency_key', 255).notNullable();
    t.jsonb('payload').notNullable();
    t.string('status', 20).notNullable().defaultTo('accepted');
    t.uuid('batch_id').references('id').inTable('ingestion_batches').onDelete('SET NULL');
    t.timestamp('source_timestamp', { useTz: true }).notNullable();
    t.timestamp('received_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('processed_at', { useTz: true });
    t.unique(['tenant_id', 'idempotency_key']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_raw_events_tenant_source_type ON raw_events (tenant_id, source, event_type);
    CREATE INDEX idx_raw_events_unprocessed ON raw_events (processed_at) WHERE processed_at IS NULL;
    CREATE INDEX idx_raw_events_tenant_received ON raw_events (tenant_id, received_at);
  `);

  await knex.schema.createTable('sync_cursors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('event_type', 20).notNullable();
    t.string('cursor_field', 50).notNullable();
    t.string('cursor_value', 255).notNullable().defaultTo('');
    t.string('status', 20).notNullable().defaultTo('idle');
    t.timestamp('next_sync_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.integer('error_count').notNullable().defaultTo(0);
    t.text('last_error');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['connection_id', 'event_type']);
  });

  // ── Modeling tables ──

  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('external_id', 255).notNullable();
    t.string('source', 20).notNullable();
    t.string('email', 255);
    t.date('first_order_date');
    t.integer('total_orders').notNullable().defaultTo(0);
    t.decimal('total_revenue', 12, 2).notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'source', 'external_id']);
  });

  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('external_id', 255).notNullable();
    t.string('source', 20).notNullable();
    t.uuid('customer_id').references('id').inTable('customers').onDelete('SET NULL');
    t.string('customer_email', 255);
    t.jsonb('line_items').notNullable().defaultTo('[]');
    t.decimal('subtotal', 12, 2).notNullable().defaultTo(0);
    t.decimal('total_discount', 12, 2).notNullable().defaultTo(0);
    t.decimal('total_tax', 12, 2).notNullable().defaultTo(0);
    t.decimal('total_revenue', 12, 2).notNullable().defaultTo(0);
    t.string('currency', 3).notNullable().defaultTo('USD');
    t.date('order_date').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'source', 'external_id']);
  });

  await knex.schema.createTable('ad_spend', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('source', 20).notNullable();
    t.string('campaign_id', 255).notNullable();
    t.string('campaign_name', 255).notNullable();
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.integer('impressions').notNullable().defaultTo(0);
    t.integer('clicks').notNullable().defaultTo(0);
    t.date('spend_date').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'source', 'campaign_id', 'spend_date']);
  });

  // ── Analytics tables ──

  await knex.schema.createTable('daily_summaries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.date('summary_date').notNullable();
    t.decimal('revenue', 12, 2).notNullable().defaultTo(0);
    t.integer('orders_count').notNullable().defaultTo(0);
    t.integer('new_customers').notNullable().defaultTo(0);
    t.decimal('ad_spend', 12, 2).notNullable().defaultTo(0);
    t.decimal('roas', 8, 4).notNullable().defaultTo(0);
    t.decimal('cac', 10, 2).notNullable().defaultTo(0);
    t.decimal('avg_order_value', 10, 2).notNullable().defaultTo(0);
    t.timestamp('computed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['tenant_id', 'summary_date']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_daily_summaries_tenant_date ON daily_summaries (tenant_id, summary_date DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('daily_summaries');
  await knex.schema.dropTableIfExists('ad_spend');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('customers');
  await knex.schema.dropTableIfExists('sync_cursors');
  await knex.schema.dropTableIfExists('raw_events');
  await knex.schema.dropTableIfExists('ingestion_batches');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('connections');
  await knex.schema.dropTableIfExists('tenants');
}
