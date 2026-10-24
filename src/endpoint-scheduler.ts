import { ProviderQueue } from './scheduler.js';
import type { DomainResult } from './types.js';

/** Share limits by the actual remote host, keeping unrelated registries independent. */
export class EndpointScheduler {
  private queues = new Map<string, ProviderQueue>();

  constructor(private concurrency: number, private minIntervalMs = 0) {}

  run(host: string, work: () => Promise<DomainResult[]>, deadline = Infinity) {
    let queue = this.queues.get(host);
    if (!queue) {
      queue = new ProviderQueue({ concurrency: this.concurrency, minIntervalMs: this.minIntervalMs });
      this.queues.set(host, queue);
    }
    return queue.run(work, deadline);
  }
}
