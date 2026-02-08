// ──────────────────────────────────────────
// Ingestion: Meta source adapter
// ──────────────────────────────────────────

import { ValidationError } from '../../../shared/errors';
import { SourceAdapter } from './shopify';

export const metaAdapter: SourceAdapter = {
  validateAndExtract(rawPayload: Record<string, unknown>) {
    if (!rawPayload.campaign_id || !rawPayload.date_start) {
      throw new ValidationError('Meta ad spend payload missing campaign_id or date_start');
    }
    return {
      externalId: `${rawPayload.campaign_id}:${rawPayload.date_start}`,
      eventType: 'ad_spend' as const,
      payload: rawPayload,
      sourceTimestamp: new Date(rawPayload.date_start as string),
    };
  },
};
