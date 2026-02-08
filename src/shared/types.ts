// ──────────────────────────────────────────
// Shared type definitions for Grow Halo
// ──────────────────────────────────────────

export type Source = 'shopify' | 'meta' | 'google';
export type EventType = 'order' | 'customer' | 'ad_spend';
export type Plan = 'starter' | 'growth' | 'enterprise';
export type ConnectionStatus = 'active' | 'paused' | 'revoked';
export type RawEventStatus = 'accepted' | 'rejected' | 'duplicate';
export type BatchStatus = 'processing' | 'completed' | 'partial_failure';
export type CursorStatus = 'idle' | 'running' | 'failed';
export type ApiKeyScope = 'ingest' | 'read' | 'admin';
export type Granularity = 'daily' | 'weekly' | 'monthly';

export interface TenantSettings {
  timezone: string;
  currency: string;
  fiscalYearStart: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  settings: TenantSettings;
  created_at: Date;
}

export interface Connection {
  id: string;
  tenant_id: string;
  source: Source;
  external_account_id: string;
  credentials: Record<string, unknown>;
  status: ConnectionStatus;
  config: Record<string, unknown>;
  created_at: Date;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  key_hash: string;
  label: string;
  scopes: ApiKeyScope[];
  last_used: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface RawEvent {
  id: string;
  tenant_id: string;
  connection_id: string | null;
  source: Source;
  event_type: EventType;
  external_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: RawEventStatus;
  batch_id: string | null;
  source_timestamp: Date;
  received_at: Date;
  processed_at: Date | null;
}

export interface IngestionBatch {
  id: string;
  tenant_id: string;
  source: Source;
  total_events: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  status: BatchStatus;
  created_at: Date;
  completed_at: Date | null;
}

export interface SyncCursor {
  id: string;
  connection_id: string;
  tenant_id: string;
  event_type: EventType;
  cursor_field: string;
  cursor_value: string;
  status: CursorStatus;
  next_sync_at: Date;
  error_count: number;
  last_error: string | null;
  created_at: Date;
}

export interface CleanOrder {
  id: string;
  tenant_id: string;
  external_id: string;
  source: Source;
  customer_id: string | null;
  customer_email: string;
  line_items: LineItem[];
  subtotal: number;
  total_discount: number;
  total_tax: number;
  total_revenue: number;
  currency: string;
  order_date: Date;
  created_at: Date;
  updated_at: Date;
}

export interface LineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CleanCustomer {
  id: string;
  tenant_id: string;
  external_id: string;
  source: Source;
  email: string;
  first_order_date: Date;
  total_orders: number;
  total_revenue: number;
  created_at: Date;
  updated_at: Date;
}

export interface CleanAdSpend {
  id: string;
  tenant_id: string;
  source: Source;
  campaign_id: string;
  campaign_name: string;
  amount: number;
  impressions: number;
  clicks: number;
  spend_date: Date;
  created_at: Date;
}

export interface DailySummary {
  id: string;
  tenant_id: string;
  summary_date: Date;
  revenue: number;
  orders_count: number;
  new_customers: number;
  ad_spend: number;
  roas: number;
  cac: number;
  avg_order_value: number;
  computed_at: Date;
}

export interface RawEventDTO {
  id: string;
  tenant_id: string;
  connection_id: string | null;
  source: Source;
  event_type: EventType;
  external_id: string;
  payload: Record<string, unknown>;
  source_timestamp: Date;
}

export interface IngestEventInput {
  externalId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  sourceTimestamp: Date;
}

export interface IngestParams {
  tenantId: string;
  connectionId?: string;
  source: Source;
  events: IngestEventInput[];
}

export interface MetricsSummary {
  current: MetricsBucket;
  previous: MetricsBucket;
  changes: MetricsChanges;
}

export interface MetricsBucket {
  revenue: number;
  orders_count: number;
  new_customers: number;
  ad_spend: number;
  roas: number;
  cac: number;
  avg_order_value: number;
}

export interface MetricsChanges {
  revenue: number;
  orders_count: number;
  new_customers: number;
  ad_spend: number;
  roas: number;
  cac: number;
  avg_order_value: number;
}

export interface TimeSeriesPoint {
  date: string;
  [metric: string]: string | number;
}
