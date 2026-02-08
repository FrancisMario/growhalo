// ──────────────────────────────────────────
// Modeling: Order transformer
// ──────────────────────────────────────────

import { RawEventDTO, CleanOrder, LineItem } from '../../../shared/types';

export class OrderTransformer {
  transform(raw: RawEventDTO): Omit<CleanOrder, 'id' | 'created_at' | 'updated_at'> {
    const p = raw.payload;

    // Extract line items from Shopify format
    const rawLineItems = (p.line_items as Record<string, unknown>[]) || [];
    const lineItems: LineItem[] = rawLineItems.map((li) => ({
      sku: String(li.sku || ''),
      name: String(li.name || li.title || ''),
      quantity: Number(li.quantity || 1),
      unitPrice: Number(li.price || 0),
      totalPrice: Number(li.price || 0) * Number(li.quantity || 1),
    }));

    const subtotal = Number(p.subtotal_price || p.subtotal || 0);
    const totalDiscount = Number(p.total_discounts || p.total_discount || 0);
    const totalTax = Number(p.total_tax || 0);
    const totalRevenue = Number(p.total_price || p.total_revenue || subtotal - totalDiscount + totalTax);
    const currency = String(p.currency || 'USD');
    const customerEmail = String(p.email || p.customer_email || (p.customer as Record<string, unknown>)?.email || '');
    const orderDate = new Date(p.created_at as string || raw.source_timestamp);

    return {
      tenant_id: raw.tenant_id,
      external_id: raw.external_id,
      source: raw.source,
      customer_id: null, // Linked later if customer record exists
      customer_email: customerEmail,
      line_items: lineItems,
      subtotal,
      total_discount: totalDiscount,
      total_tax: totalTax,
      total_revenue: totalRevenue,
      currency,
      order_date: orderDate,
    };
  }
}
