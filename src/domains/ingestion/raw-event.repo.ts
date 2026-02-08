// ──────────────────────────────────────────
// Ingestion: Raw event repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { IngestionContract } from '../../shared/contracts';
import { RawEvent, RawEventDTO, EventType } from '../../shared/types';

export class RawEventRepo implements IngestionContract {
  constructor(private db: Knex) {}

  async insert(events: Partial<RawEvent>[]): Promise<{ accepted: number; duplicates: number }> {
    if (events.length === 0) return { accepted: 0, duplicates: 0 };

    const result = await this.db.raw(
      `${this.db('raw_events').insert(events).toString()} ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`
    );
    const accepted = result.rows.length;
    const duplicates = events.length - accepted;
    return { accepted, duplicates };
  }

  async getUnprocessedEvents(params: { eventType?: EventType; limit?: number }): Promise<RawEventDTO[]> {
    const limit = params.limit ?? 100;
    let query = this.db('raw_events')
      .select('id', 'tenant_id', 'connection_id', 'source', 'event_type', 'external_id', 'payload', 'source_timestamp')
      .where('status', 'accepted')
      .whereNull('processed_at')
      .orderBy('received_at', 'asc')
      .limit(limit);

    if (params.eventType) {
      query = query.where('event_type', params.eventType);
    }
    return query;
  }

  async markProcessed(rawEventId: string): Promise<void> {
    await this.db('raw_events')
      .where('id', rawEventId)
      .update({ processed_at: new Date() });
  }

  async markFailed(rawEventId: string, reason: string): Promise<void> {
    await this.db('raw_events')
      .where('id', rawEventId)
      .update({ status: 'rejected', processed_at: new Date() });
  }

  async countUnprocessed(tenantId: string): Promise<Record<string, number>> {
    const rows = await this.db('raw_events')
      .where('tenant_id', tenantId)
      .where('status', 'accepted')
      .whereNull('processed_at')
      .groupBy('source')
      .select('source')
      .count('* as count');

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.source as string] = Number(row.count);
    }
    return result;
  }
}
