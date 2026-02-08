// ──────────────────────────────────────────
// Ingestion: Shopify source adapter
// ──────────────────────────────────────────

import { IngestEventInput, EventType } from '../../../shared/types';
import { ValidationError } from '../../../shared/errors';

export interface SourceAdapter {
  validateAndExtract(rawPayload: Record<string, unknown>): IngestEventInput;
}

export const shopifyAdapter: SourceAdapter = {
  validateAndExtract(rawPayload: Record<string, unknown>): IngestEventInput {
    // Determine event type from payload shape
    const eventType = detectShopifyEventType(rawPayload);

    if (eventType === 'order') {
      if (!rawPayload.id || !rawPayload.created_at) {
        throw new ValidationError('Shopify order missing id or created_at');
      }
      return {
        externalId: String(rawPayload.id),
        eventType: 'order',
        payload: rawPayload,
        sourceTimestamp: new Date(rawPayload.created_at as string),
      };
    }

    if (eventType === 'customer') {
      if (!rawPayload.id || !rawPayload.created_at) {
        throw new ValidationError('Shopify customer missing id or created_at');
      }
      return {
        externalId: String(rawPayload.id),
        eventType: 'customer',
        payload: rawPayload,
        sourceTimestamp: new Date(rawPayload.created_at as string),
      };
    }

    throw new ValidationError(`Unknown Shopify event type for payload`);
  },
};

function detectShopifyEventType(payload: Record<string, unknown>): EventType {
  // Orders have line_items, customers have email but no line_items
  if (payload.line_items || payload.total_price !== undefined) return 'order';
  if (payload.email !== undefined && !payload.line_items) return 'customer';
  // Default based on explicit event_type field if present
  if (payload.event_type) return payload.event_type as EventType;
  return 'order';
}
