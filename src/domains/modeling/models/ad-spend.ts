// ──────────────────────────────────────────
// Modeling: Ad spend model repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { CleanAdSpend } from '../../../shared/types';

export class AdSpendModel {
  constructor(private db: Knex) {}

  async upsert(adSpend: Omit<CleanAdSpend, 'id' | 'created_at'>): Promise<void> {
    await this.db.raw(
      `${this.db('ad_spend').insert(adSpend).toString()}
       ON CONFLICT (tenant_id, source, campaign_id, spend_date)
       DO UPDATE SET
         campaign_name = EXCLUDED.campaign_name,
         amount = EXCLUDED.amount,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks`
    );
  }

  async getByDate(tenantId: string, date: Date): Promise<CleanAdSpend[]> {
    return this.db('ad_spend')
      .where('tenant_id', tenantId)
      .where('spend_date', date)
      .select('*');
  }
}
