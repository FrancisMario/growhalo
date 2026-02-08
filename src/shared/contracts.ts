// ──────────────────────────────────────────
// Domain contracts — typed interfaces between domains
// ──────────────────────────────────────────

import { RawEventDTO, EventType, CleanOrder, CleanCustomer, CleanAdSpend } from './types';

/**
 * Ingestion contract — exposed to Modeling domain.
 * Modeling calls these to pull raw events and signal processing status.
 */
export interface IngestionContract {
  getUnprocessedEvents(params: { eventType?: EventType; limit?: number }): Promise<RawEventDTO[]>;
  markProcessed(rawEventId: string): Promise<void>;
  markFailed(rawEventId: string, reason: string): Promise<void>;
}

/**
 * Modeling contract — exposed to Analytics domain.
 * Analytics calls these to read clean domain models for aggregation.
 */
export interface ModelingContract {
  getOrdersByDate(tenantId: string, date: Date): Promise<CleanOrder[]>;
  getNewCustomersByDate(tenantId: string, date: Date): Promise<CleanCustomer[]>;
  getAdSpendByDate(tenantId: string, date: Date): Promise<CleanAdSpend[]>;
}
