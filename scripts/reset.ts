// ──────────────────────────────────────────
// Script: Reset — drop all tables and re-run migrations
// ──────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeDb } from '../src/db/connection';

async function reset() {
  const db = getDb();
  console.log('[Reset] Dropping all tables...');

  // Drop in reverse FK order
  await db.raw('DROP TABLE IF EXISTS daily_summaries CASCADE');
  await db.raw('DROP TABLE IF EXISTS ad_spend CASCADE');
  await db.raw('DROP TABLE IF EXISTS orders CASCADE');
  await db.raw('DROP TABLE IF EXISTS customers CASCADE');
  await db.raw('DROP TABLE IF EXISTS sync_cursors CASCADE');
  await db.raw('DROP TABLE IF EXISTS raw_events CASCADE');
  await db.raw('DROP TABLE IF EXISTS ingestion_batches CASCADE');
  await db.raw('DROP TABLE IF EXISTS api_keys CASCADE');
  await db.raw('DROP TABLE IF EXISTS connections CASCADE');
  await db.raw('DROP TABLE IF EXISTS tenants CASCADE');
  await db.raw('DROP TABLE IF EXISTS knex_migrations CASCADE');
  await db.raw('DROP TABLE IF EXISTS knex_migrations_lock CASCADE');

  console.log('[Reset] Running migrations...');
  await db.migrate.latest({
    directory: __dirname + '/../src/db/migrations',
    extension: 'ts',
  });

  console.log('[Reset] ✅ Done — all tables recreated');

  // Optionally re-seed
  if (process.argv.includes('--seed')) {
    console.log('[Reset] Running seed...');
    // Import dynamically to avoid circular issues
    await import('./seed');
    return; // seed.ts handles exit
  }

  await closeDb();
  process.exit(0);
}

reset().catch((err) => {
  console.error('[Reset] Error:', err);
  process.exit(1);
});
