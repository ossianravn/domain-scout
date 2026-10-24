import { ProviderQueue } from './scheduler.js';
import { result, type DomainName, type DomainProvider, type DomainResult } from './types.js';

type Attempt = NonNullable<DomainResult['attempts']>[number];

export class LookupRouter {
  private queues: ProviderQueue[];

  constructor(private providers: DomainProvider[]) {
    this.queues = providers.map(provider => new ProviderQueue(provider));
  }

  async lookup(names: DomainName[], options: {
    start?: number; deadline?: number; onResult?: (items: DomainResult[]) => void;
  } = {}): Promise<DomainResult[]> {
    const { start = 0, deadline = Infinity, onResult } = options;
    const output = new Map<string, DomainResult>();
    const settled = new Set<string>();
    const coverage = new Map<string, Attempt[]>();
    const groups = new Map<number, DomainName[]>();
    const runs: Promise<void>[] = [];
    let flushQueued = false;
    const publish = (items: DomainResult[]) => {
      for (const item of items) { output.set(item.domain, item); settled.add(item.domain); }
      if (items.length) onResult?.(items);
    };

    const runGroup = async (index: number, group: DomainName[]) => {
      const provider = this.providers[index];
      const chunks: DomainName[][] = [];
      for (let offset = 0; offset < group.length; offset += provider.batchSize) {
        chunks.push(group.slice(offset, offset + provider.batchSize));
      }
      await Promise.all(chunks.map(async chunk => {
        let checked: DomainResult[];
        const began = Date.now();
        try {
          checked = provider.managesScheduling
            ? await provider.check(chunk, { deadline })
            : await this.queues[index].run(() => provider.check(chunk, { deadline }), deadline);
        } catch (error) {
          const reason = (error as { reason?: string })?.reason ?? (error instanceof Error ? error.message : 'Lookup failed');
          const retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
          checked = chunk.map(name => result(name, provider.id, 'unknown', 'Request failed', { reason, retryAfterMs }));
        }
        const byDomain = new Map(checked.map(item => [item.domain.toLowerCase(), item]));
        const fallback: DomainName[] = [];
        const complete: DomainResult[] = [];
        for (const name of chunk) {
          const found = byDomain.get(name.domain);
          const item = found ? { ...found, domain: name.domain } : result(name, provider.id, 'unknown', 'Missing provider result');
          const attempts = [...(coverage.get(name.domain) ?? []), ...(item.attempts ?? [])];
          if (attempts.length) item.attempts = attempts;
          item.durationMs ??= Date.now() - began;
          output.set(name.domain, item);
          if (item.reason !== 'time_budget_exhausted' && (item.status === 'unknown' || item.status === 'unsupported')) {
            fallback.push(name);
          } else complete.push(item);
        }
        // A slow fallback for one name must not hide completed neighbors.
        publish(complete);
        if (!fallback.length) return;
        await this.lookup(fallback, {
          start: index + 1, deadline,
          onResult: items => publish(items.map(item => {
            const previous = output.get(item.domain)!;
            if (item.source === 'routing' && item.status === 'unsupported') return previous;
            return {
              ...item,
              attempts: [
                ...(previous.attempts ?? []),
                { source: previous.source, status: previous.status, reason: previous.reason,
                  ...(previous.registry ? { registry: previous.registry } : {}) },
                ...(item.attempts ?? []),
              ],
            };
          })),
        });
      }));
    };

    const flush = () => {
      flushQueued = false;
      for (const [index, group] of groups) {
        runs.push(runGroup(index, group).catch(() => publish(group
          .filter(name => !settled.has(name.domain))
          .map(name => result(name, this.providers[index].id, 'unknown', 'Lookup failed', {
            reason: 'invalid_provider_result', attempts: coverage.get(name.domain),
          })))));
      }
      groups.clear();
    };

    await Promise.all(names.map(async name => {
      const attempts: Attempt[] = [];
      coverage.set(name.domain, attempts);
      for (let index = start; index < this.providers.length; index++) {
        if (Date.now() >= deadline) {
          publish([result(name, 'scheduler', 'unknown', 'The lookup wait budget expired before source discovery completed.', {
            reason: 'time_budget_exhausted', ...(attempts.length ? { attempts } : {}),
          })]);
          return;
        }
        try {
          if (!(await this.providers[index].supports(name))) continue;
        } catch {
          attempts.push({ source: this.providers[index].id, status: 'unknown', reason: 'coverage_lookup_failed' });
          continue;
        }
        const group = groups.get(index) ?? [];
        group.push(name);
        groups.set(index, group);
        // Coalesce selections in this turn without waiting for unrelated catalogs.
        if (!flushQueued) { flushQueued = true; queueMicrotask(flush); }
        return;
      }
      publish([result(name, 'routing', attempts.length ? 'unknown' : 'unsupported', 'Provider coverage', {
        reason: attempts.length ? 'Provider coverage could not be fully established.' : 'No configured source supports this suffix.',
        ...(attempts.length ? { attempts } : {}),
      })]);
    }));
    if (groups.size) flush();
    await Promise.all(runs);
    return names.map(name => output.get(name.domain)!);
  }
}
