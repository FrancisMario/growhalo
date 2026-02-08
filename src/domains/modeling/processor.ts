// ──────────────────────────────────────────
// Modeling: Raw event processor (scheduled job)
// ──────────────────────────────────────────

import { Knex } from 'knex';
import { IngestionContract, ModelingContract } from '../../shared/contracts';
import { CleanOrder, CleanCustomer, CleanAdSpend, RawEventDTO } from '../../shared/types';
import { OrderModel } from './models/order';
import { CustomerModel } from './models/customer';
import { AdSpendModel } from './models/ad-spend';
import { OrderTransformer } from './transformers/order.transformer';
import { CustomerTransformer } from './transformers/customer.transformer';
import { AdSpendTransformer } from './transformers/ad-spend.transformer';

export class RawEventProcessor implements ModelingContract {
  private orderTransformer = new OrderTransformer();
  private customerTransformer = new CustomerTransformer();
  private adSpendTransformer = new AdSpendTransformer();

  constructor(
    private db: Knex,
    private ingestion: IngestionContract,
    private orderModel: OrderModel,
    private customerModel: CustomerModel,
    private adSpendModel: AdSpendModel
  ) {}

  async run(): Promise<void> {
    const events = await this.ingestion.getUnprocessedEvents({ limit: 100 });
    if (events.length === 0) return;

    console.log(`[Processor] Processing ${events.length} raw events`);

    for (const event of events) {
      try {
        await this.processEvent(event);
        await this.ingestion.markProcessed(event.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Processor] Failed event ${event.id}:`, message);
        await this.ingestion.markFailed(event.id, message);
      }
    }
  }

  private async processEvent(event: RawEventDTO): Promise<void> {
    switch (event.event_type) {
      case 'order': {
        const clean = this.orderTransformer.transform(event);
        await this.orderModel.upsert(clean);
        break;
      }
      case 'customer': {
        const clean = this.customerTransformer.transform(event);
        await this.customerModel.upsert(clean);
        break;
      }
      case 'ad_spend': {
        const clean = this.adSpendTransformer.transform(event);
        await this.adSpendModel.upsert(clean);
        break;
      }
      default:
        throw new Error(`Unknown event type: ${event.event_type}`);
    }
  }

  // ── ModelingContract implementation ──

  async getOrdersByDate(tenantId: string, date: Date): Promise<CleanOrder[]> {
    return this.orderModel.getByDate(tenantId, date);
  }

  async getNewCustomersByDate(tenantId: string, date: Date): Promise<CleanCustomer[]> {
    return this.customerModel.getNewByDate(tenantId, date);
  }

  async getAdSpendByDate(tenantId: string, date: Date): Promise<CleanAdSpend[]> {
    return this.adSpendModel.getByDate(tenantId, date);
  }
}
