// ──────────────────────────────────────────
// Modeling: Order model repository
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { CleanOrder } from '../../../shared/types';

export class OrderModel {
  constructor(private db: Knex) {}

  async upsert(order: Omit<CleanOrder, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date();
    const row = {
      ...order,
      line_items: JSON.stringify(order.line_items),
      updated_at: now,
    };
    await this.db.raw(
      `${this.db('orders').insert(row).toString()}
       ON CONFLICT (tenant_id, source, external_id)
       DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         customer_email = EXCLUDED.customer_email,
         line_items = EXCLUDED.line_items,
         subtotal = EXCLUDED.subtotal,
         total_discount = EXCLUDED.total_discount,
         total_tax = EXCLUDED.total_tax,
         total_revenue = EXCLUDED.total_revenue,
         currency = EXCLUDED.currency,
         order_date = EXCLUDED.order_date,
         updated_at = EXCLUDED.updated_at`
    );
  }

  async getByDate(tenantId: string, date: Date): Promise<CleanOrder[]> {
    return this.db('orders')
      .where('tenant_id', tenantId)
      .where('order_date', date)
      .select('*');
  }
}
