// ──────────────────────────────────────────
// Modeling: Ad spend transformer
// ──────────────────────────────────────────

import { RawEventDTO, CleanAdSpend } from '../../../shared/types';

export class AdSpendTransformer {
  transform(raw: RawEventDTO): Omit<CleanAdSpend, 'id' | 'created_at'> {
    const p = raw.payload;

    // Meta format: campaign_id, campaign_name, spend, impressions, clicks, date_start
    // Google format: campaign_id, campaign_name, cost_micros, impressions, clicks, date
    const isMeta = raw.source === 'meta';

    const amount = isMeta
      ? Number(p.spend || p.amount || 0)
      : Number(p.cost_micros || 0) / 1_000_000 || Number(p.amount || 0);

    const spendDate = new Date(
      (isMeta ? p.date_start : p.date) as string || raw.source_timestamp
    );

    return {
      tenant_id: raw.tenant_id,
      source: raw.source,
      campaign_id: String(p.campaign_id || ''),
      campaign_name: String(p.campaign_name || ''),
      amount,
      impressions: Number(p.impressions || 0),
      clicks: Number(p.clicks || 0),
      spend_date: spendDate,
    };
  }
}
