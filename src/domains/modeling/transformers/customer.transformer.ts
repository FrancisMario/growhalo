// ──────────────────────────────────────────
// Modeling: Customer transformer
// ──────────────────────────────────────────

import { RawEventDTO, CleanCustomer } from '../../../shared/types';

export class CustomerTransformer {
  transform(raw: RawEventDTO): Omit<CleanCustomer, 'id' | 'created_at' | 'updated_at'> {
    const p = raw.payload;

    const email = String(p.email || '');
    const firstOrderDate = new Date(
      (p.first_order_date || p.created_at || raw.source_timestamp) as string
    );
    const totalOrders = Number(p.orders_count || p.total_orders || 0);
    const totalRevenue = Number(p.total_spent || p.total_revenue || 0);

    return {
      tenant_id: raw.tenant_id,
      external_id: raw.external_id,
      source: raw.source,
      email,
      first_order_date: firstOrderDate,
      total_orders: totalOrders,
      total_revenue: totalRevenue,
    };
  }
}
