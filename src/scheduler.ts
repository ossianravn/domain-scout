import { setTimeout as delay } from 'node:timers/promises';
import type { DomainProvider, DomainResult } from './types.js';

export class ProviderQueue {
  private active = 0;
  private nextStart = 0;
  private pauseUntil = 0;
  private waiting: (() => void)[] = [];
  private startGate: Promise<void> = Promise.resolve();

  constructor(private provider: Pick<DomainProvider, 'concurrency' | 'minIntervalMs'>) {}

  async run(work: () => Promise<DomainResult[]>, deadline = Infinity): Promise<DomainResult[]> {
    if (this.active >= this.provider.concurrency) {
      await new Promise<void>(resolve => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      await this.waitForStart(deadline);
      if (Date.now() >= deadline) throw Object.assign(new Error('The lookup wait budget was exhausted.'), {
        reason: 'time_budget_exhausted',
      });
      const results = await work();
      for (const item of results) {
        const cooldown = item.retryAfterMs ?? (item.reason === 'rate_limited' ? 1000 : 0);
        if (cooldown) this.pauseUntil = Math.max(this.pauseUntil, Date.now() + cooldown);
      }
      return results;
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }

  private async waitForStart(deadline: number): Promise<void> {
    const previous = this.startGate;
    let release!: () => void;
    this.startGate = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      if (Math.max(Date.now(), this.nextStart) >= deadline) {
        throw Object.assign(new Error('The lookup wait budget was exhausted before this request could start.'), {
          reason: 'time_budget_exhausted',
        });
      }
      if (this.pauseUntil > Date.now()) {
        throw Object.assign(new Error('Provider temporarily rate limited'), {
          reason: 'rate_limited',
          retryAfterMs: this.pauseUntil - Date.now(),
        });
      }
      if (this.nextStart > Date.now()) await delay(this.nextStart - Date.now());
      if (Date.now() >= deadline) {
        throw Object.assign(new Error('The lookup wait budget was exhausted before this request could start.'), {
          reason: 'time_budget_exhausted',
        });
      }
      if (this.pauseUntil > Date.now()) {
        throw Object.assign(new Error('Provider temporarily rate limited'), {
          reason: 'rate_limited',
          retryAfterMs: this.pauseUntil - Date.now(),
        });
      }
      this.nextStart = Date.now() + this.provider.minIntervalMs;
    } finally { release(); }
  }
}
