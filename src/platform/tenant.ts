// ──────────────────────────────────────────
// Platform: Tenant repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { Tenant } from '../shared/types';

export class TenantRepo {
  constructor(private db: Knex) {}

  async findById(id: string): Promise<Tenant | null> {
    const row = await this.db('tenants').where('id', id).first();
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.db('tenants').where('slug', slug).first();
    return row ?? null;
  }

  async findAll(): Promise<Tenant[]> {
    return this.db('tenants').select('*');
  }

  async create(tenant: Omit<Tenant, 'id' | 'created_at'>): Promise<Tenant> {
    const [row] = await this.db('tenants').insert(tenant).returning('*');
    return row;
  }
}
