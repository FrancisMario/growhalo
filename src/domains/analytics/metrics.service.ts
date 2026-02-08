// ──────────────────────────────────────────
// Analytics: Metrics service
// ──────────────────────────────────────────

import { DailySummaryRepo } from './daily-summary.repo';
import {
  MetricsSummary,
  MetricsBucket,
  TimeSeriesPoint,
  Granularity,
  DailySummary,
} from '../../shared/types';

export class MetricsService {
  constructor(private summaryRepo: DailySummaryRepo) {}

  async getSummary(tenantId: string, period: string): Promise<MetricsSummary> {
    const { currentStart, currentEnd, previousStart, previousEnd } = parsePeriod(period);

    const [currentRows, previousRows] = await Promise.all([
      this.summaryRepo.getByDateRange(tenantId, currentStart, currentEnd),
      this.summaryRepo.getByDateRange(tenantId, previousStart, previousEnd),
    ]);

    const current = rollup(currentRows);
    const previous = rollup(previousRows);

    return {
      current,
      previous,
      changes: {
        revenue: pctChange(current.revenue, previous.revenue),
        orders_count: pctChange(current.orders_count, previous.orders_count),
        new_customers: pctChange(current.new_customers, previous.new_customers),
        ad_spend: pctChange(current.ad_spend, previous.ad_spend),
        roas: pctChange(current.roas, previous.roas),
        cac: pctChange(current.cac, previous.cac),
        avg_order_value: pctChange(current.avg_order_value, previous.avg_order_value),
      },
    };
  }

  async getTimeSeries(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    granularity: Granularity,
    metrics: string[]
  ): Promise<TimeSeriesPoint[]> {
    const rows = await this.summaryRepo.getByDateRange(tenantId, startDate, endDate);

    // Bucket rows by granularity
    const buckets = bucketByGranularity(rows, granularity);

    return buckets.map((bucket) => {
      const rolled = rollup(bucket.rows);
      const point: TimeSeriesPoint = { date: bucket.label };
      for (const m of metrics) {
        if (m in rolled) {
          point[m] = (rolled as unknown as Record<string, number>)[m];
        }
      }
      return point;
    });
  }

  async getAdSpendBreakdown(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    _groupBy: string
  ): Promise<Record<string, unknown>[]> {
    // For source-level breakdown, we need to query ad_spend table directly
    // since daily_summaries are already aggregated across sources
    const { db } = this.summaryRepo as unknown as { db: import('knex').Knex };
    // Fall back to daily_summaries for now — source breakdown requires ad_spend table
    const rows = await this.summaryRepo.getByDateRange(tenantId, startDate, endDate);
    const rolled = rollup(rows);
    return [{
      source: 'all',
      ad_spend: rolled.ad_spend,
      revenue: rolled.revenue,
      roas: rolled.roas,
      pct_of_total: 100,
    }];
  }
}

// ── Helpers ──

function parsePeriod(period: string): {
  currentStart: Date; currentEnd: Date;
  previousStart: Date; previousEnd: Date;
} {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  let days = 30;
  if (period === 'last_7_days') days = 7;
  else if (period === 'last_14_days') days = 14;
  else if (period === 'last_30_days') days = 30;
  else if (period === 'last_90_days') days = 90;

  const currentEnd = new Date(now);
  const currentStart = new Date(now);
  currentStart.setUTCDate(currentStart.getUTCDate() - days);

  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);

  return { currentStart, currentEnd, previousStart, previousEnd };
}

function rollup(rows: DailySummary[]): MetricsBucket {
  const revenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const ordersCount = rows.reduce((s, r) => s + Number(r.orders_count), 0);
  const newCustomers = rows.reduce((s, r) => s + Number(r.new_customers), 0);
  const adSpend = rows.reduce((s, r) => s + Number(r.ad_spend), 0);

  // Derived from totals — never averaged from daily values
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const cac = newCustomers > 0 ? adSpend / newCustomers : 0;
  const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;

  return {
    revenue: Math.round(revenue * 100) / 100,
    orders_count: ordersCount,
    new_customers: newCustomers,
    ad_spend: Math.round(adSpend * 100) / 100,
    roas: Math.round(roas * 10000) / 10000,
    cac: Math.round(cac * 100) / 100,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
  };
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

interface Bucket {
  label: string;
  rows: DailySummary[];
}

function bucketByGranularity(rows: DailySummary[], granularity: Granularity): Bucket[] {
  const map = new Map<string, DailySummary[]>();

  for (const row of rows) {
    const d = new Date(row.summary_date);
    let key: string;

    if (granularity === 'daily') {
      key = d.toISOString().slice(0, 10);
    } else if (granularity === 'weekly') {
      // ISO week start (Monday)
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setUTCDate(diff);
      key = weekStart.toISOString().slice(0, 10);
    } else {
      // monthly
      key = d.toISOString().slice(0, 7);
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({ label, rows }));
}
