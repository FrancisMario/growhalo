// ──────────────────────────────────────────
// Ingestion: Core service — the single funnel
// ──────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import { Knex } from 'knex';
import { RawEventRepo } from './raw-event.repo';
import { IngestParams, IngestionBatch, RawEvent, Source } from '../../shared/types';
import { shopifyAdapter, SourceAdapter } from './adapters/shopify';
import { metaAdapter } from './adapters/meta';
import { googleAdapter } from './adapters/google';

const adapters: Record<Source, SourceAdapter> = {
  shopify: shopifyAdapter,
  meta: metaAdapter,
  google: googleAdapter,
};

export class IngestionService {
  constructor(
    private db: Knex,
    private rawEventRepo: RawEventRepo
  ) {}

  async ingest(params: IngestParams): Promise<IngestionBatch> {
    const { tenantId, connectionId, source, events } = params;
    const batchId = uuidv4();

    // 1. Create batch record
    await this.db('ingestion_batches').insert({
      id: batchId,
      tenant_id: tenantId,
      source,
      total_events: events.length,
      status: 'processing',
    });

    const adapter = adapters[source];
    const rawRows: Partial<RawEvent>[] = [];
    let rejected = 0;

    // 2. Validate each event through the source adapter
    for (const event of events) {
      try {
        // If events already come pre-extracted (from batch upload with explicit fields),
        // use them directly; otherwise run through adapter
        const extracted = event.externalId
          ? event
          : adapter.validateAndExtract(event.payload);

        const idempotencyKey = `${source}:${extracted.eventType}:${extracted.externalId}`;

        rawRows.push({
          tenant_id: tenantId,
          connection_id: connectionId ?? null,
          source,
          event_type: extracted.eventType,
          external_id: extracted.externalId,
          idempotency_key: idempotencyKey,
          payload: extracted.payload,
          status: 'accepted',
          batch_id: batchId,
          source_timestamp: extracted.sourceTimestamp,
        });
      } catch {
        rejected++;
      }
    }

    // 3. Bulk insert with dedup
    const { accepted, duplicates } = await this.rawEventRepo.insert(rawRows);

    // 4. Update batch with final counts
    const status = rejected === events.length ? 'partial_failure'
      : rejected > 0 ? 'partial_failure'
      : 'completed';

    await this.db('ingestion_batches').where('id', batchId).update({
      accepted,
      rejected,
      duplicates,
      status,
      completed_at: new Date(),
    });

    const [batch] = await this.db('ingestion_batches').where('id', batchId);
    return batch;
  }

  async getBatch(batchId: string): Promise<IngestionBatch | null> {
    const row = await this.db('ingestion_batches').where('id', batchId).first();
    return row ?? null;
  }

  async listBatches(tenantId: string): Promise<IngestionBatch[]> {
    return this.db('ingestion_batches')
      .where('tenant_id', tenantId)
      .orderBy('created_at', 'desc')
      .limit(50);
  }

  async getPipelineStatus(tenantId: string): Promise<Record<string, unknown>> {
    const unprocessed = await this.rawEventRepo.countUnprocessed(tenantId);
    return { unprocessed_by_source: unprocessed };
  }
}
