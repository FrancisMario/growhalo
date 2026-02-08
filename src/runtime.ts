// ──────────────────────────────────────────
// Runtime: Background job scheduler
// ──────────────────────────────────────────

import { PollOrchestrator } from './domains/ingestion/polling/orchestrator';
import { RawEventProcessor } from './domains/modeling/processor';
import { AggregationJob } from './domains/analytics/aggregation.job';

export class Runtime {
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private pollOrchestrator: PollOrchestrator,
    private rawEventProcessor: RawEventProcessor,
    private aggregationJob: AggregationJob
  ) {}

  start(): void {
    // Poll orchestrator — every 30s
    this.intervals.push(
      setInterval(() => {
        this.pollOrchestrator.run().catch((err) =>
          console.error('[Runtime] PollOrchestrator error:', err.message)
        );
      }, 30_000)
    );

    // Raw event processor — every 30s
    this.intervals.push(
      setInterval(() => {
        this.rawEventProcessor.run().catch((err) =>
          console.error('[Runtime] RawEventProcessor error:', err.message)
        );
      }, 30_000)
    );

    // Aggregation job — every 60s
    this.intervals.push(
      setInterval(() => {
        this.aggregationJob.run().catch((err) =>
          console.error('[Runtime] AggregationJob error:', err.message)
        );
      }, 60_000)
    );

    console.log('[Runtime] Started background jobs (poll: 30s, process: 30s, aggregate: 60s)');
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    console.log('[Runtime] Stopped background jobs');
  }

  async runOnce(): Promise<void> {
    console.log('[Runtime] Running all jobs once...');
    await this.pollOrchestrator.run();
    await this.rawEventProcessor.run();
    await this.aggregationJob.run();
    console.log('[Runtime] Completed single run');
  }
}
