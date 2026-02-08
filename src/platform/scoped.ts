// ──────────────────────────────────────────
// Platform: Tenant-scoped query helper
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { getTenantId } from './context';

export function scopedQuery(db: Knex, table: string): Knex.QueryBuilder {
  return db(table).where(`${table}.tenant_id`, getTenantId());
}
