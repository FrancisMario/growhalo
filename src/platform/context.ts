// ──────────────────────────────────────────
// Platform: AsyncLocalStorage-based tenant context
// ──────────────────────────────────────────

import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

export function withTenantScope<T>(tenantId: string, fn: () => T): T {
  return tenantStore.run({ tenantId }, fn);
}

export function getTenantId(): string {
  const ctx = tenantStore.getStore();
  if (!ctx?.tenantId) {
    throw new Error('No tenant context — request is not scoped to a tenant');
  }
  return ctx.tenantId;
}
