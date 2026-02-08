// ──────────────────────────────────────────
// Ingestion: Source pollers
// ──────────────────────────────────────────
// Per-source fetch logic. In production these would call real APIs.
// For now they return empty results — data enters via batch upload / webhook.

import { SyncCursor, IngestEventInput } from '../../../shared/types';

export interface PollResult {
  events: IngestEventInput[];
  nextCursorValue: string | null;
  hasMore: boolean;
}

export interface SourcePoller {
  poll(cursor: SyncCursor): Promise<PollResult>;
}

export const shopifyPoller: SourcePoller = {
  async poll(_cursor: SyncCursor): Promise<PollResult> {
    // In production: call Shopify REST/GraphQL API with cursor position
    return { events: [], nextCursorValue: null, hasMore: false };
  },
};

export const metaPoller: SourcePoller = {
  async poll(_cursor: SyncCursor): Promise<PollResult> {
    // In production: call Meta Marketing API with cursor position
    return { events: [], nextCursorValue: null, hasMore: false };
  },
};

export const googlePoller: SourcePoller = {
  async poll(_cursor: SyncCursor): Promise<PollResult> {
    // In production: call Google Ads API with cursor position
    return { events: [], nextCursorValue: null, hasMore: false };
  },
};

export function getPollerForSource(source: string): SourcePoller {
  switch (source) {
    case 'shopify': return shopifyPoller;
    case 'meta': return metaPoller;
    case 'google': return googlePoller;
    default: throw new Error(`No poller for source: ${source}`);
  }
}
