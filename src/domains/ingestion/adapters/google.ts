// ──────────────────────────────────────────
// Ingestion: Google source adapter
// ──────────────────────────────────────────

import { ValidationError } from '../../../shared/errors';
import { SourceAdapter } from './shopify';

export const googleAdapter: SourceAdapter = {
  validateAndExtract(rawPayload: Record<string, unknown>) {
    if (!rawPayload.campaign_id || !rawPayload.date) {
      throw new ValidationError('Google ad spend payload missing campaign_id or date');
    }
    return {
      externalId: `${rawPayload.campaign_id}:${rawPayload.date}`,
      eventType: 'ad_spend' as const,
      payload: rawPayload,
      sourceTimestamp: new Date(rawPayload.date as string),
    };
  },
};
