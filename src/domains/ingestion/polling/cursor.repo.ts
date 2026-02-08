// ──────────────────────────────────────────
// Ingestion: Sync cursor repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { SyncCursor } from '../../../shared/types';

export class CursorRepo {
  constructor(private db: Knex) {}

  async findDue(): Promise<SyncCursor[]> {
    return this.db('sync_cursors')
      .where('status', 'idle')
      .where('next_sync_at', '<=', new Date())
      .orderBy('next_sync_at', 'asc');
  }

  async markRunning(cursorId: string): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({ status: 'running' });
  }

  async updateCursor(cursorId: string, newValue: string, nextSyncAt: Date): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({
      cursor_value: newValue,
      next_sync_at: nextSyncAt,
      status: 'idle',
      error_count: 0,
      last_error: null,
    });
  }

  async markFailed(cursorId: string, error: string): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({
      status: 'failed',
      last_error: error,
      error_count: this.db.raw('error_count + 1'),
    });
  }

  async markIdle(cursorId: string): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({ status: 'idle' });
  }

  async findByTenantId(tenantId: string): Promise<SyncCursor[]> {
    return this.db('sync_cursors').where('tenant_id', tenantId);
  }

  async findByConnectionId(connectionId: string): Promise<SyncCursor[]> {
    return this.db('sync_cursors').where('connection_id', connectionId);
  }

  async create(cursor: Omit<SyncCursor, 'id' | 'created_at'>): Promise<SyncCursor> {
    const [row] = await this.db('sync_cursors').insert(cursor).returning('*');
    return row;
  }

  async resetCursor(cursorId: string): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({
      cursor_value: '',
      status: 'idle',
      error_count: 0,
      last_error: null,
      next_sync_at: new Date(),
    });
  }

  async triggerSync(cursorId: string): Promise<void> {
    await this.db('sync_cursors').where('id', cursorId).update({
      next_sync_at: new Date(),
      status: 'idle',
    });
  }
}
