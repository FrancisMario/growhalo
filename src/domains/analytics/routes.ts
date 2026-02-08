// ──────────────────────────────────────────
// Analytics: API routes
// ──────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { AggregationJob } from './aggregation.job';
import { getTenantId } from '../../platform/context';
import { Granularity } from '../../shared/types';

export function createAnalyticsRoutes(
  metricsService: MetricsService,
  aggregationJob: AggregationJob
): Router {
  const router = Router();

  // GET /summary?period=last_30_days — dashboard cards
  router.get('/summary', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const period = (req.query.period as string) || 'last_30_days';
      const summary = await metricsService.getSummary(tenantId, period);
      res.json(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /?start=...&end=...&granularity=daily&metrics=revenue,ad_spend,roas — time-series
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const start = new Date(req.query.start as string);
      const end = new Date(req.query.end as string);
      const granularity = (req.query.granularity as Granularity) || 'daily';
      const metrics = ((req.query.metrics as string) || 'revenue,orders_count,ad_spend,roas').split(',');

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ error: 'Invalid start or end date' });
        return;
      }

      const data = await metricsService.getTimeSeries(tenantId, start, end, granularity, metrics);
      res.json({ data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /ad-spend?start=...&end=...&group_by=source — ad spend breakdown
  router.get('/ad-spend', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const start = new Date(req.query.start as string);
      const end = new Date(req.query.end as string);
      const groupBy = (req.query.group_by as string) || 'source';

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ error: 'Invalid start or end date' });
        return;
      }

      const data = await metricsService.getAdSpendBreakdown(tenantId, start, end, groupBy);
      res.json({ data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // POST /aggregate — force re-aggregation (admin scope)
  router.post('/aggregate', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const { start_date, end_date } = req.body;

      if (start_date && end_date) {
        await aggregationJob.runForDateRange(tenantId, new Date(start_date), new Date(end_date));
      } else {
        await aggregationJob.run();
      }

      res.json({ message: 'Aggregation complete' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
