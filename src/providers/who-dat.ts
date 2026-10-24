import { MAX_TIMER_MS } from '../config.js';
import { asRecord, type DomainName, type DomainProvider, type DomainResult,
  type HttpResult, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

function configuredBase(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && !url.search && !url.hash) return url;
  } catch { /* Report configuration without echoing possible credentials. */ }
  throw new Error('DOMAIN_SCOUT_WHO_DAT_URL must be an HTTP(S) base URL without credentials, query or fragment.');
}

function provenance(body: Record<string, unknown>, response: HttpResult): Partial<DomainResult> {
  const meta = asRecord(body.meta);
  const extra: Partial<DomainResult> = {};
  if (typeof meta.fetchedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(meta.fetchedAt)
    && Number.isFinite(Date.parse(meta.fetchedAt))) {
    extra.observedAt = new Date(meta.fetchedAt).toISOString();
  }
  if (typeof meta.cached === 'boolean') extra.upstreamCached = meta.cached;
  if (Number(response.headers.get('age')) > 0
    || /^(HIT|STALE)$/i.test(response.headers.get('x-vercel-cache') ?? '')) extra.upstreamCached = true;
  if (typeof meta.server === 'string' && meta.server.length <= 2048) {
    try {
      const server = new URL(meta.server.includes('://') ? meta.server : `whois://${meta.server}`);
      if (['http:', 'https:', 'whois:'].includes(server.protocol) && !server.username && !server.password) {
        extra.registry = server.hostname.toLowerCase();
      }
    } catch { /* Missing registry identity does not invent a server. */ }
  }
  return extra;
}

export function createWhoDatProvider(ctx: ProviderContext): DomainProvider {
  const base = configuredBase(ctx.env.DOMAIN_SCOUT_WHO_DAT_URL);
  const token = ctx.env.DOMAIN_SCOUT_WHO_DAT_TOKEN?.trim();
  const budgetExpired = (name: DomainName) => checked(ctx, name, 'who-dat', 'unknown',
    'The lookup wait budget expired before Who-Dat could complete.', { reason: 'time_budget_exhausted' });
  return {
    id: 'who-dat', batchSize: 1,
    minIntervalMs: base?.hostname === 'who-dat.as93.net' ? 2000 : 250, concurrency: 2,
    supports: async () => Boolean(base),
    async check(names, options = {}) {
      return Promise.all(names.map(async name => {
        if (!base) return checked(ctx, name, 'who-dat', 'unsupported',
          'No owner-provided Who-Dat endpoint is configured.', { reason: 'provider_not_configured' });
        const deadline = options.deadline ?? Infinity;
        const remaining = deadline - Date.now();
        if (remaining <= 0) return budgetExpired(name);
        try {
          const url = new URL(base);
          url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/whois/${encodeURIComponent(name.domain)}`;
          const signal = Number.isFinite(remaining)
            ? AbortSignal.timeout(Math.min(MAX_TIMER_MS, Math.ceil(remaining))) : undefined;
          const response = await ctx.request(url.href, {
            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            redirect: 'error', signal,
          });
          if (response.status !== 200) return httpFailure(ctx, name, 'who-dat', response);
          const body = asRecord(response.body);
          const meta = asRecord(body.meta);
          if (body.error !== undefined || !sameDomain(body.query, name) || !sameDomain(body.domain, name)
            || typeof body.isRegistered !== 'boolean' || !['rdap', 'whois'].includes(String(meta.source))) {
            return malformed(ctx, name, 'who-dat');
          }
          const extra = provenance(body, response);
          const cacheNote = ' Who-Dat may reuse records for one hour by default; this check does not bypass its cache.';
          if (body.isRegistered) return checked(ctx, name, 'who-dat', 'registered',
            `Who-Dat reports this queried domain as registered via ${String(meta.source).toUpperCase()}.${cacheNote}`, extra);
          return checked(ctx, name, 'who-dat', 'unknown',
            'Who-Dat reports isRegistered=false, which can include missing, reserved, premium or blocked names.'
              + ' Registrability was not established.' + cacheNote,
            { ...extra, reason: 'ambiguous_registration_status' });
        } catch {
          return Date.now() >= deadline ? budgetExpired(name) : transportFailure(ctx, name, 'who-dat');
        }
      }));
    },
  };
}
