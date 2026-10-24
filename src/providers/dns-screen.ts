import { randomBytes } from 'node:crypto';
import { z } from 'zod/v4';
import type { DomainName, DomainProvider, DomainResult, ProviderContext } from '../types.js';
import { checked } from './shared.js';

const defaultResolvers = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];

export function parseDnsResolvers(value: string | undefined): string[] {
  const resolvers = value === undefined ? [...defaultResolvers] : value.split(',').map(item => item.trim()).filter(Boolean);
  for (const resolver of resolvers) {
    try {
      if (new URL(resolver).protocol !== 'https:') throw new Error('Expected HTTPS');
    } catch {
      throw new Error('DOMAIN_SCOUT_DNS_RESOLVERS must contain comma-separated HTTPS URLs.');
    }
  }
  return resolvers;
}

const normalize = (name: string) => name.toLowerCase().replace(/\.$/, '');
const dnsResponse = z.object({
  Status: z.number(), TC: z.unknown().optional(),
  Question: z.tuple([z.object({ name: z.string() })]).rest(z.unknown()),
  Answer: z.unknown().optional(),
});
const dnsRecord = z.object({ name: z.string(), type: z.number(), data: z.unknown().optional() });
type Outcome = { kind: 'delegated'; nameservers: string[] } | { kind: 'absent' | 'inconclusive' | 'error' };
type ProbeOutcome = 'absent' | 'delegated' | 'inconclusive';

function hostname(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = normalize(value);
  return name.length <= 253 && name.split('.').every(label => label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ? name : undefined;
}

export function createDnsScreenProvider(
  ctx: ProviderContext, needsScreen: (name: DomainName) => Promise<boolean>,
): DomainProvider {
  const resolvers = parseDnsResolvers(ctx.env.DOMAIN_SCOUT_DNS_RESOLVERS);
  const probes = new Map<string, { outcome: 'absent' | 'delegated'; until: number }>();

  async function query(resolver: string, domain: string, deadline?: number): Promise<Outcome> {
    try {
      const remaining = deadline === undefined ? 2500 : deadline - Date.now();
      if (remaining <= 0) return { kind: 'error' };
      const response = await ctx.request(`${resolver}?name=${encodeURIComponent(domain)}&type=NS`, {
        method: 'GET', headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(Math.min(2500, remaining)),
      });
      if (response.status !== 200) return { kind: 'error' };
      const parsed = dnsResponse.safeParse(response.body);
      if (!parsed.success) return { kind: 'error' };
      const body = parsed.data;
      if (body.TC === true || normalize(body.Question[0].name) !== domain
        || (body.Status !== 0 && body.Status !== 3)) return { kind: 'error' };
      if (body.Status === 3) return { kind: 'absent' };
      const nameservers: string[] = [];
      for (const value of Array.isArray(body.Answer) ? body.Answer : []) {
        const record = dnsRecord.safeParse(value);
        if (!record.success || normalize(record.data.name) !== domain) continue;
        if (record.data.type === 5) return { kind: 'inconclusive' };
        const server = record.data.type === 2 ? hostname(record.data.data) : undefined;
        if (server) nameservers.push(server);
      }
      return nameservers.length ? { kind: 'delegated', nameservers } : { kind: 'absent' };
    } catch { return { kind: 'error' }; }
  }

  async function probe(resolver: string, suffix: string, deadline?: number): Promise<ProbeOutcome> {
    const key = `${resolver}\n${suffix}`;
    const cached = probes.get(key);
    if (cached && cached.until > ctx.now()) return cached.outcome;
    try {
      const sibling = `ds${randomBytes(6).toString('hex')}.${suffix}`;
      const outcome = await query(resolver, sibling, deadline);
      if (outcome.kind === 'absent' || outcome.kind === 'delegated') {
        probes.set(key, { outcome: outcome.kind, until: ctx.now() + 10 * 60 * 1000 });
        return outcome.kind;
      }
      return 'inconclusive';
    } catch { return 'inconclusive'; }
  }

  async function checkName(name: DomainName, deadline?: number): Promise<DomainResult> {
    let registry: string | undefined;
    try {
      if (deadline !== undefined && Date.now() >= deadline) {
        return checked(ctx, name, 'dns', 'unknown', 'The wait budget expired before DNS screening started.',
          { reason: 'time_budget_exhausted' });
      }
      for (const resolver of resolvers) {
        const outcome = await query(resolver, name.domain, deadline);
        if (outcome.kind === 'error') continue;
        registry = new URL(resolver).hostname;
        if (outcome.kind === 'absent') {
          return checked(ctx, name, 'dns', 'unknown', 'DNS shows no delegation for this name; the registry decides.',
            { reason: 'dns_no_delegation', registry });
        }
        if (outcome.kind === 'delegated' && await probe(resolver, name.suffix, deadline) === 'absent') {
          return checked(ctx, name, 'dns', 'likely_taken',
            `DNS lists nameservers for ${name.displayDomain} (${outcome.nameservers.slice(0, 4).join(', ')}), so it is almost certainly registered. The registry was not asked.`,
            { reason: 'dns_delegated', registry });
        }
        return checked(ctx, name, 'dns', 'unknown',
          'DNS could not rule this name out (wildcard or alias); the registry decides.',
          { reason: 'dns_inconclusive', registry });
      }
    } catch {
      return checked(ctx, name, 'dns', 'unknown',
        'DNS could not rule this name out (wildcard or alias); the registry decides.',
        { reason: 'dns_inconclusive', ...(registry ? { registry } : {}) });
    }
    return checked(ctx, name, 'dns', 'unknown', 'No DNS resolver answered; the registry decides.',
      { reason: 'dns_unavailable' });
  }

  return {
    id: 'dns', batchSize: 1, minIntervalMs: 0, concurrency: 8,
    supports: async name => resolvers.length > 0 && await needsScreen(name),
    check: (names, options) => Promise.all(names.map(name => checkName(name, options?.deadline))),
  };
}
