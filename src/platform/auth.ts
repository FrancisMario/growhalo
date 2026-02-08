// ──────────────────────────────────────────
// Platform: Auth middleware + API key resolution
// ──────────────────────────────────────────

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Knex } from 'knex';
import { ApiKey, ApiKeyScope } from '../shared/types';
import { withTenantScope } from './context';

export class ApiKeyRepo {
  constructor(private db: Knex) {}

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const row = await this.db('api_keys').where('key_hash', keyHash).first();
    return row ?? null;
  }

  async create(apiKey: Omit<ApiKey, 'id' | 'created_at' | 'last_used'>): Promise<ApiKey> {
    const [row] = await this.db('api_keys')
      .insert({ ...apiKey, last_used: null })
      .returning('*');
    return row;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db('api_keys').where('id', id).update({ last_used: new Date() });
  }
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { raw: string; hash: string } {
  const raw = `ghk_${crypto.randomBytes(24).toString('hex')}`;
  const hash = hashApiKey(raw);
  return { raw, hash };
}

export function apiKeyAuth(apiKeyRepo: ApiKeyRepo, requiredScope?: ApiKeyScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawKey = req.headers['x-api-key'] as string | undefined;
    if (!rawKey) {
      res.status(401).json({ error: 'Missing x-api-key header' });
      return;
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await apiKeyRepo.findByHash(keyHash);

    if (!apiKey) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      res.status(401).json({ error: 'API key expired' });
      return;
    }

    if (requiredScope && !apiKey.scopes.includes(requiredScope)) {
      res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
      return;
    }

    // Touch last_used in background — don't block the request
    apiKeyRepo.touchLastUsed(apiKey.id).catch(() => {});

    // Run the rest of the request inside tenant scope
    withTenantScope(apiKey.tenant_id, () => next());
  };
}
