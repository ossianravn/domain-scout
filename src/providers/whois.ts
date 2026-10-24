import { MAX_TIMER_MS } from '../config.js';
import { EndpointScheduler } from '../endpoint-scheduler.js';
import { RegistryCatalog } from '../registry-catalog.js';
import type { DomainName, DomainProvider, DomainResult, ProviderContext } from '../types.js';
import { checked } from './shared.js';
import { classifyWhois } from './whois-parser.js';

// Dedicated services have different budgets; .pl WHOIS permits only 100/day/IP.
// Norid's ordinary WHOIS is for technical/contact lookups, not availability searches.
// Red.es opens port 43 only to IP addresses it has authorised; others time out.
export const genericWhoisExcludedSuffixes = new Set(['dk', 'is', 'be', 'ch', 'li', 'nl', 'se', 'nu', 'pl', 'no', 'es']);

function query(host: string, name: DomainName): string {
  // DENIC public-whois docs; JPRS official examples use /e for English output.
  if (host === 'whois.denic.de') return `-T dn,ace ${name.domain}`;
  if (host === 'whois.jprs.jp') return `${name.domain}/e`;
  if (host.endsWith('.verisign-grs.com') || host === 'whois.verisign-grs.com') return `domain ${name.domain}`;
  return name.domain;
}

function interval(env: ProviderContext['env']): number {
  const raw = env.DOMAIN_SCOUT_WHOIS_INTERVAL_MS;
  const value = raw === undefined || raw.trim() === '' ? 1000 : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIMER_MS) {
    throw new Error(`DOMAIN_SCOUT_WHOIS_INTERVAL_MS must be a nonnegative integer at most ${MAX_TIMER_MS}.`);
  }
  return value;
}

export function createWhoisProvider(ctx: ProviderContext, catalog = new RegistryCatalog()): DomainProvider {
  // This is a configurable local precaution, not a published universal registry quota.
  const queues = new EndpointScheduler(1, interval(ctx.env));
  const routeFor = (name: DomainName) => genericWhoisExcludedSuffixes.has(name.domain.split('.').at(-1)!)
    ? undefined : catalog.lookup(name.domain)?.whoisServer;

  function classify(name: DomainName, host: string, text: string): DomainResult {
    const classification = classifyWhois(text, name);
    const evidence = classification.status === 'registered'
      ? `${host} returned a matching WHOIS domain record with registration evidence.`
      : classification.status === 'unavailable'
        ? `${host} explicitly reports the matching domain reserved, blocked or unavailable.`
        : classification.status === 'not_found'
          ? `${host} returned an explicit WHOIS no-record response. Registrability and pricing remain unverified.`
          : classification.reason === 'rate_limited'
            ? `${host} restricted WHOIS requests. A conservative 60-second cooldown is estimated; no reset time was supplied.`
            : `${host} did not return sufficient, matching WHOIS evidence to establish the domain status.`;
    return checked(ctx, name, 'whois', classification.status, evidence, {
      registry: host, ...(classification.reason ? { reason: classification.reason } : {}),
      ...(classification.reason === 'rate_limited' ? { retryAfterMs: 60_000 } : {}),
    });
  }

  return {
    id: 'whois', batchSize: 1, minIntervalMs: 0, concurrency: 1, managesScheduling: true,
    supports: async name => Boolean(routeFor(name)),
    async check(names, options = {}) {
      return Promise.all(names.map(async name => {
        const host = routeFor(name);
        if (!host) return checked(ctx, name, 'whois', 'unsupported',
          'No permitted generic WHOIS route is configured for this suffix.', { reason: 'no_whois_route' });
        try {
          const results = await queues.run(host, async () => {
            try { return [classify(name, host, await ctx.whois(host, query(host, name)))]; }
            catch { return [checked(ctx, name, 'whois', 'unknown',
              `${host} could not be reached or the WHOIS request timed out.`, { registry: host, reason: 'request_failed' })]; }
          }, options.deadline);
          return results[0]!;
        } catch (error) {
          const failure = error as { reason?: string; retryAfterMs?: number };
          const reason = failure.reason === 'time_budget_exhausted' || failure.reason === 'rate_limited'
            ? failure.reason : 'request_failed';
          return checked(ctx, name, 'whois', 'unknown', reason === 'time_budget_exhausted'
            ? `The wait budget expired before the WHOIS request to ${host} could start.`
            : `WHOIS requests to ${host} are temporarily paused.`, {
              registry: host, reason,
              ...(failure.retryAfterMs === undefined ? {} : { retryAfterMs: failure.retryAfterMs }),
            });
        }
      }));
    },
  };
}
