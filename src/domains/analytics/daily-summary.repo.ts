// ──────────────────────────────────────────
// Analytics: Daily summary repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { DailySummary } from '../../shared/types';

export class DailySummaryRepo {
  constructor(private db: Knex) {}

  async upsert(summary: Omit<DailySummary, 'id'>): Promise<void> {
    await this.db.raw(
      `${this.db('daily_summaries').insert(summary).toString()}
       ON CONFLICT (tenant_id, summary_date)
       DO UPDATE SET
         revenue = EXCLUDED.revenue,
         orders_count = EXCLUDED.orders_count,
         new_customers = EXCLUDED.new_customers,
         ad_spend = EXCLUDED.ad_spend,
         roas = EXCLUDED.roas,
         cac = EXCLUDED.cac,
         avg_order_value = EXCLUDED.avg_order_value,
         computed_at = EXCLUDED.computed_at`
    );
  }

  async getByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<DailySummary[]> {
    return this.db('daily_summaries')
      .where('tenant_id', tenantId)
      .whereBetween('summary_date', [startDate, endDate])
      .orderBy('summary_date', 'asc');
  }

  async getLatest(tenantId: string): Promise<DailySummary | null> {
    const row = await this.db('daily_summaries')
      .where('tenant_id', tenantId)
      .orderBy('summary_date', 'desc')
      .first();
    return row ?? null;
  }
}
