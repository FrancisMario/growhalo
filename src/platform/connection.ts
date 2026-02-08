// ──────────────────────────────────────────
// Platform: Connection repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { Connection, Source } from '../shared/types';

export class ConnectionRepo {
  constructor(private db: Knex) {}

  async findById(id: string): Promise<Connection | null> {
    const row = await this.db('connections').where('id', id).first();
    return row ?? null;
  }

  async findByExternalAccount(source: Source, externalAccountId: string): Promise<Connection | null> {
    const row = await this.db('connections')
      .where({ source, external_account_id: externalAccountId, status: 'active' })
      .first();
    return row ?? null;
  }

  async findByTenantId(tenantId: string): Promise<Connection[]> {
    return this.db('connections').where('tenant_id', tenantId);
  }

  async create(connection: Omit<Connection, 'id' | 'created_at'>): Promise<Connection> {
    const [row] = await this.db('connections').insert(connection).returning('*');
    return row;
  }
}
