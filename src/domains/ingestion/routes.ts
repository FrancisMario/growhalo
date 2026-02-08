// ──────────────────────────────────────────
// Ingestion: API routes
// ──────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { IngestionService } from './ingestion.service';
import { CursorRepo } from './polling/cursor.repo';
import { ConnectionRepo } from '../../platform/connection';
import { getTenantId } from '../../platform/context';
import { Source, EventType } from '../../shared/types';

export function createIngestionRoutes(
  ingestionService: IngestionService,
  cursorRepo: CursorRepo,
  connectionRepo: ConnectionRepo
): Router {
  const router = Router();

  // POST /batch — bulk upload (API key auth already applied)
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const { source, events } = req.body;

      if (!source || !events || !Array.isArray(events)) {
        res.status(400).json({ error: 'Missing source or events array' });
        return;
      }

      const batch = await ingestionService.ingest({
        tenantId,
        source: source as Source,
        events,
      });

      res.status(201).json(batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // POST /webhook/:source — webhook receiver
  router.post('/webhook/:source', async (req: Request, res: Response) => {
    try {
      const source = req.params.source as Source;
      if (!['shopify', 'meta', 'google'].includes(source)) {
        res.status(400).json({ error: `Unsupported source: ${source}` });
        return;
      }

      // Resolve tenant from connection (extract external account ID from headers/payload)
      const externalAccountId =
        (req.headers['x-shopify-shop-domain'] as string) ||
        (req.body?.account_id as string) ||
        (req.headers['x-account-id'] as string);

      if (!externalAccountId) {
        res.status(400).json({ error: 'Cannot determine external account ID' });
        return;
      }

      const connection = await connectionRepo.findByExternalAccount(source, externalAccountId);
      if (!connection) {
        res.status(404).json({ error: 'No active connection for this account' });
        return;
      }

      // Webhook payload is a single event or array
      const payloads = Array.isArray(req.body) ? req.body : [req.body];
      const events = payloads.map((payload: Record<string, unknown>) => ({
        externalId: String(payload.id || ''),
        eventType: (payload.event_type || 'order') as EventType,
        payload,
        sourceTimestamp: new Date((payload.created_at || payload.date || new Date()) as string),
      }));

      const batch = await ingestionService.ingest({
        tenantId: connection.tenant_id,
        connectionId: connection.id,
        source,
        events,
      });

      res.status(201).json(batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /batches — list batch statuses
  router.get('/batches', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const batches = await ingestionService.listBatches(tenantId);
      res.json(batches);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /batches/:id — single batch detail
  router.get('/batches/:id', async (req: Request, res: Response) => {
    try {
      const batch = await ingestionService.getBatch(req.params.id as string);
      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      res.json(batch);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /status — pipeline health per source
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const status = await ingestionService.getPipelineStatus(tenantId);
      res.json(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // GET /syncs — list sync cursors
  router.get('/syncs', async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId();
      const cursors = await cursorRepo.findByTenantId(tenantId);
      res.json(cursors);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // POST /syncs/:id/trigger — force immediate poll
  router.post('/syncs/:id/trigger', async (req: Request, res: Response) => {
    try {
      await cursorRepo.triggerSync(req.params.id as string);
      res.json({ message: 'Sync triggered' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  // POST /syncs/:id/reset — reset cursor for backfill
  router.post('/syncs/:id/reset', async (req: Request, res: Response) => {
    try {
      await cursorRepo.resetCursor(req.params.id as string);
      res.json({ message: 'Cursor reset' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
