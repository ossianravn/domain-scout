import { EndpointScheduler } from '../endpoint-scheduler.js';
import { RegistryCatalog } from '../registry-catalog.js';
import { asRecord, type DomainName, type DomainProvider, type DomainResult, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

function interpret(ctx: ProviderContext, name: DomainName, registry: string,
  response: Awaited<ReturnType<ProviderContext['request']>>): DomainResult {
  const body = asRecord(response.body);
  const matching = body.objectClassName === 'domain' && body.errorCode === undefined
    && sameDomain(body.ldhName ?? body.unicodeName, name)
    && (body.unicodeName === undefined || sameDomain(body.unicodeName, name));
  let item: DomainResult;
  if (response.status === 200 && matching) {
    const statuses = Array.isArray(body.status) ? body.status.map(String) : [];
    const withheld = registry === 'rdap.nic.ch'
      || statuses.some(value => /^(reserved|withheld|not assigned)$/i.test(value));
    item = checked(ctx, name, 'rdap', withheld ? 'unavailable' : 'registered',
      `${registry} returned a matching ${withheld ? 'domain record that may be registered or withheld' : 'registration record'}.`);
  } else if (response.status === 404 && ((body.errorCode === 404 && body.objectClassName === undefined
    && body.ldhName === undefined && body.unicodeName === undefined) ||
    (registry === 'rdap.nic.ch' && !response.text.trim()))) {
    item = checked(ctx, name, 'rdap', 'not_found',
      `${registry} returned a no-record response. Registrability and pricing remain unverified.`);
  } else {
    item = response.status === 200 || response.status === 404
      ? malformed(ctx, name, 'rdap') : httpFailure(ctx, name, 'rdap', response);
  }
  return { ...item, registry };
}

export function createRdapProvider(ctx: ProviderContext, catalog = new RegistryCatalog()): DomainProvider {
  const endpoints = new EndpointScheduler(4);
  return {
    id: 'rdap', batchSize: 1, minIntervalMs: 0, concurrency: 4, managesScheduling: true,
    // Dedicated ISNIC/SIDN adapters retain registry-specific semantics and limits.
    supports: async name => !['is', 'nl'].includes(name.suffix) && Boolean(catalog.lookup(name.domain)?.rdapUrls.length),
    async check(names, { deadline = Infinity } = {}) {
      return Promise.all(names.map(async name => {
        const urls = catalog.lookup(name.domain)?.rdapUrls ?? [];
        const attempts: NonNullable<DomainResult['attempts']> = [];
        let last = checked(ctx, name, 'rdap', 'unsupported', 'The routing catalog contains no RDAP service.');
        for (const base of urls) {
          const registry = new URL(base).host;
          try {
            const rows = await endpoints.run(registry, async () => {
              try {
                const remaining = deadline - Date.now();
                if (remaining <= 0) return [checked(ctx, name, 'rdap', 'unknown',
                  'The wait budget expired before the registry request started.', { registry, reason: 'time_budget_exhausted' })];
                const response = await ctx.request(`${base.replace(/\/$/, '')}/domain/${encodeURIComponent(name.domain)}`, {
                  headers: { Accept: 'application/rdap+json, application/json' },
                  ...(Number.isFinite(remaining) ? { signal: AbortSignal.timeout(Math.max(1, remaining)) } : {}),
                });
                return [interpret(ctx, name, registry, response)];
              } catch {
                if (Date.now() >= deadline) return [checked(ctx, name, 'rdap', 'unknown',
                  'The registry request exceeded the remaining wait budget.', { registry, reason: 'time_budget_exhausted' })];
                return [{ ...transportFailure(ctx, name, 'rdap'), registry }];
              }
            }, deadline);
            last = rows[0];
          } catch (error) {
            const failure = error as { reason?: string; retryAfterMs?: number };
            last = checked(ctx, name, 'rdap', 'unknown', 'The registry request could not start.', {
              registry, reason: failure.reason ?? 'request_failed', retryAfterMs: failure.retryAfterMs,
            });
          }
          if (attempts.length) last = { ...last, attempts: [...attempts] };
          if (!['unknown', 'unsupported'].includes(last.status) || last.reason === 'time_budget_exhausted') return last;
          attempts.push({ source: 'rdap', registry, status: last.status, reason: last.reason });
        }
        return last;
      }));
    },
  };
}
