// ──────────────────────────────────────────
// Analytics: Aggregation job (scheduled, 60s interval)
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { ModelingContract } from '../../shared/contracts';
import { DailySummaryRepo } from './daily-summary.repo';
import { TenantRepo } from '../../platform/tenant';

export class AggregationJob {
  constructor(
    private db: Knex,
    private modeling: ModelingContract,
    private summaryRepo: DailySummaryRepo,
    private tenantRepo: TenantRepo
  ) {}

  async run(): Promise<void> {
    const tenants = await this.tenantRepo.findAll();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const tenant of tenants) {
      try {
        await this.aggregateForDate(tenant.id, today);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Aggregation] Failed for tenant ${tenant.id}:`, message);
      }
    }
  }

  async runForDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<void> {
    const current = new Date(startDate);
    while (current <= endDate) {
      await this.aggregateForDate(tenantId, new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  private async aggregateForDate(tenantId: string, date: Date): Promise<void> {
    const [orders, newCustomers, adSpendRecords] = await Promise.all([
      this.modeling.getOrdersByDate(tenantId, date),
      this.modeling.getNewCustomersByDate(tenantId, date),
      this.modeling.getAdSpendByDate(tenantId, date),
    ]);

    const revenue = orders.reduce((sum, o) => sum + Number(o.total_revenue), 0);
    const ordersCount = orders.length;
    const newCustomerCount = newCustomers.length;
    const adSpendTotal = adSpendRecords.reduce((sum, a) => sum + Number(a.amount), 0);

    // Derived metrics — computed from totals, not averages
    const roas = adSpendTotal > 0 ? revenue / adSpendTotal : 0;
    const cac = newCustomerCount > 0 ? adSpendTotal / newCustomerCount : 0;
    const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;

    await this.summaryRepo.upsert({
      tenant_id: tenantId,
      summary_date: date,
      revenue: Math.round(revenue * 100) / 100,
      orders_count: ordersCount,
      new_customers: newCustomerCount,
      ad_spend: Math.round(adSpendTotal * 100) / 100,
      roas: Math.round(roas * 10000) / 10000,
      cac: Math.round(cac * 100) / 100,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      computed_at: new Date(),
    });
  }
}
