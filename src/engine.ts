import { MAX_TIMER_MS, readSettings } from './config.js';
import { LookupRouter } from './lookup.js';
import { isDomainName, normalizeDomain } from './normalize.js';
import { createProviders } from './providers/index.js';
import { RegistryCatalog } from './registry-catalog.js';
import { describeSources } from './sources.js';
import { createNetworkContext } from './transport.js';
import { result, type DomainName, type DomainProvider, type DomainResult, type ProviderContext } from './types.js';

export interface CheckOutput {
  results: DomainResult[];
  summary: { inputCount: number; uniqueDomains: number; cacheHits: number; elapsedMs: number; maxWaitMs: number; deferred: number };
  interpretation: string;
}

export class DomainEngine {
  private router: LookupRouter;
  private cache = new Map<string, { value: DomainResult; until: number }>();
  private inflight = new Map<string, Promise<DomainResult>>();
  private context: ProviderContext;
  private ttl: number;
  private maxWaitMs: number;
  private catalog: RegistryCatalog;

  constructor(options: { context?: ProviderContext; providers?: DomainProvider[]; cacheTtlMs?: number; catalog?: RegistryCatalog } = {}) {
    this.context = options.context ?? createNetworkContext();
    this.catalog = options.catalog ?? new RegistryCatalog();
    this.ttl = options.cacheTtlMs ?? readSettings(this.context.env).cacheTtlMs;
    this.maxWaitMs = readSettings(this.context.env).maxWaitMs;
    this.router = new LookupRouter(options.providers ?? createProviders(this.context, this.catalog));
  }

  sources(tlds: string[] = [], refresh = false) {
    return describeSources(this.catalog, this.context, tlds, refresh);
  }

  async check(domains: string[], fresh = false, maxWaitMs = this.maxWaitMs): Promise<CheckOutput> {
    if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs <= 0 || maxWaitMs > MAX_TIMER_MS) {
      throw new Error(`maxWaitMs must be a positive integer at most ${MAX_TIMER_MS}.`);
    }
    const started = this.context.now();
    const deadline = Date.now() + maxWaitMs;
    for (const [key, entry] of this.cache) if (entry.until <= started) this.cache.delete(key);
    const normalized = domains.map(normalizeDomain);
    const unique = new Map(normalized.filter(isDomainName).map(name => [name.domain, name]));
    const promises = new Map<string, Promise<DomainResult>>();
    const work: DomainName[] = [];
    const resolve = new Map<string, (value: DomainResult) => void>();
    const completed = new Map<string, DomainResult>();
    let cacheHits = 0;
    for (const name of unique.values()) {
      const cached = this.cache.get(name.domain);
      if (!fresh && cached && cached.until > started) {
        cacheHits++;
        promises.set(name.domain, Promise.resolve({ ...cached.value, cached: true }));
        continue;
      }
      if (cached) this.cache.delete(name.domain);
      let pending = this.inflight.get(name.domain);
      if (!pending) {
        pending = new Promise<DomainResult>(done => resolve.set(name.domain, done));
        this.inflight.set(name.domain, pending);
        work.push(name);
      }
      promises.set(name.domain, pending);
    }
    if (work.length) {
      const finish = (items: DomainResult[]) => {
        for (const item of items) {
          const done = resolve.get(item.domain);
          if (!done) continue;
          resolve.delete(item.domain);
          const value = { ...item, cached: false };
          if (this.ttl && !['unknown', 'invalid'].includes(item.status)) {
            this.cache.set(item.domain, { value, until: this.context.now() + this.ttl });
          }
          this.inflight.delete(item.domain);
          done(value);
        }
      };
      void this.router.lookup(work, { deadline, onResult: finish }).then(finish, error => finish(work.map(name =>
        result(name, 'routing', 'unknown', 'Lookup failed', { reason: error instanceof Error ? error.message : 'Unknown error' }))));
    }
    const all = Promise.all([...promises].map(async ([key, pending]) => {
      const item = await pending;
      completed.set(key, item);
    }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([all, new Promise<void>(done => {
        timer = setTimeout(done, Math.max(0, deadline - Date.now()));
      })]);
    } finally { clearTimeout(timer); }
    const results = normalized.map(item => !isDomainName(item) ? item : completed.get(item.domain) ??
      result(item, 'scheduler', 'unknown', 'The wait budget expired before this check completed. Retry unresolved names or increase maxWaitMs.', {
        reason: 'time_budget_exhausted',
      }));
    return {
      results,
      summary: {
        inputCount: domains.length, uniqueDomains: unique.size, cacheHits,
        elapsedMs: this.context.now() - started, maxWaitMs,
        deferred: results.filter(item => item.reason === 'time_budget_exhausted').length,
      },
      interpretation: 'Available means explicitly reported registrable by the named source at checkedAt. No-record, unknown, unsupported and invalid results need further resolution. Prices retain the provider currency and quoted periods.',
    };
  }
}
