// ──────────────────────────────────────────
// Ingestion: Poll orchestrator
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { CursorRepo } from './cursor.repo';
import { getPollerForSource } from './pollers';
import { IngestionService } from '../ingestion.service';
import { Source } from '../../../shared/types';

export class PollOrchestrator {
  constructor(
    private db: Knex,
    private cursorRepo: CursorRepo,
    private ingestionService: IngestionService
  ) {}

  async run(): Promise<void> {
    const dueCursors = await this.cursorRepo.findDue();
    if (dueCursors.length === 0) return;

    for (const cursor of dueCursors) {
      try {
        await this.cursorRepo.markRunning(cursor.id);

        // Look up connection to get the source
        const connection = await this.db('connections')
          .where('id', cursor.connection_id)
          .first();

        if (!connection || connection.status !== 'active') {
          await this.cursorRepo.markIdle(cursor.id);
          continue;
        }

        const source: Source = connection.source;
        const poller = getPollerForSource(source);
        const result = await poller.poll(cursor);

        if (result.events.length > 0) {
          await this.ingestionService.ingest({
            tenantId: cursor.tenant_id,
            connectionId: cursor.connection_id,
            source,
            events: result.events,
          });
        }

        const pollInterval = (connection.config as Record<string, unknown>)?.pollInterval as number || 30_000;
        const nextSyncAt = new Date(Date.now() + pollInterval);

        if (result.nextCursorValue) {
          await this.cursorRepo.updateCursor(cursor.id, result.nextCursorValue, nextSyncAt);
        } else {
          await this.cursorRepo.updateCursor(cursor.id, cursor.cursor_value, nextSyncAt);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.cursorRepo.markFailed(cursor.id, message);
        console.error(`[PollOrchestrator] Failed cursor ${cursor.id}:`, message);
      }
    }
  }
}
