// ──────────────────────────────────────────
// Modeling: Customer model repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { CleanCustomer } from '../../../shared/types';

export class CustomerModel {
  constructor(private db: Knex) {}

  async upsert(customer: Omit<CleanCustomer, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date();
    await this.db.raw(
      `${this.db('customers').insert({ ...customer, updated_at: now }).toString()}
       ON CONFLICT (tenant_id, source, external_id)
       DO UPDATE SET
         email = EXCLUDED.email,
         first_order_date = LEAST(customers.first_order_date, EXCLUDED.first_order_date),
         total_orders = EXCLUDED.total_orders,
         total_revenue = EXCLUDED.total_revenue,
         updated_at = EXCLUDED.updated_at`
    );
  }

  async getNewByDate(tenantId: string, date: Date): Promise<CleanCustomer[]> {
    return this.db('customers')
      .where('tenant_id', tenantId)
      .where('first_order_date', date)
      .select('*');
  }
}
