import { type DomainName, type DomainProvider, type DomainResult, type ProviderContext } from '../types.js';
import { checked, malformed, sameDomain, transportFailure } from './shared.js';

const BELGIUM = 'dnsbelgium-das';
const SWITCH = 'switch-domaincheck';

function belgiumResult(ctx: ProviderContext, name: DomainName, text: string): DomainResult {
  const codes = [...text.matchAll(/^%%\s*RC=(-?\d+)\s*$/gm)];
  if (codes.length !== 1) return malformed(ctx, name, BELGIUM);
  const code = Number(codes[0]![1]);
  if (code === -2) return checked(ctx, name, BELGIUM, 'unknown',
    'DNS Belgium rejected excessive queries. A conservative 60-second cooldown is estimated; the actual reset is the end of its minute.',
    { reason: 'rate_limited', retryAfterMs: 60_000 });
  if (code === -3) return checked(ctx, name, BELGIUM, 'unknown',
    'DNS Belgium has blocked this IP address; no availability result was returned.', { reason: 'access_blocked' });
  if (code === -1) return checked(ctx, name, BELGIUM, 'unknown',
    'DNS Belgium reported an internal service error.', { reason: 'registry_error' });
  if (code !== 0) return malformed(ctx, name, BELGIUM);
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const field = /^(Domain|A-label|Status):\s*(.*?)\s*$/i.exec(line);
    if (!field) continue;
    const key = field[1]!.toLowerCase();
    if (fields.has(key)) return malformed(ctx, name, BELGIUM);
    fields.set(key, field[2]!);
  }
  if (!sameDomain(fields.get('domain'), name)
    || (fields.has('a-label') && !sameDomain(fields.get('a-label'), name))) {
    return malformed(ctx, name, BELGIUM);
  }
  const status = fields.get('status')?.toUpperCase();
  if (status === 'AVAILABLE') return checked(ctx, name, BELGIUM, 'available',
    'DNS Belgium DAS explicitly reports the matching domain free to register.');
  if (status === 'NOT AVAILABLE' || status === 'REGISTERED') return checked(ctx, name, BELGIUM, 'registered',
    'DNS Belgium DAS reports the matching domain already registered.');
  if (status === 'NOT ALLOWED') return checked(ctx, name, BELGIUM, 'invalid',
    'DNS Belgium rejects this domain under its domain-name syntax rules.', { reason: 'registry_rejects_name' });
  return malformed(ctx, name, BELGIUM);
}

/** https://docs.dnsbelgium.be/be/general/whoisanddas.html */
export function createBelgiumProvider(ctx: ProviderContext): DomainProvider {
  return {
    id: BELGIUM, batchSize: 1, minIntervalMs: 1200, concurrency: 1,
    supports: async (name) => name.suffix === 'be',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          return belgiumResult(ctx, name, await ctx.whois('das.dns.be', name.domain, 4343));
        } catch { return transportFailure(ctx, name, BELGIUM); }
      }));
    },
  };
}

function switchResult(ctx: ProviderContext, name: DomainName, text: string): DomainResult {
  const lines = text.trim().split(/\r?\n/);
  const reply = /^(-?\d+)\s*:[^\r\n]*$/.exec(lines[0] ?? '');
  if (!reply || lines.slice(1).some(line => /^-?\d+\s*:/.test(line))) {
    return malformed(ctx, name, SWITCH);
  }
  // Human-readable explanations may change; only the documented code is stable.
  const code = Number(reply[1]);
  if (code === 1) return checked(ctx, name, SWITCH, 'available',
    'SWITCH Domain Check explicitly reports this domain can be registered.');
  if (code === 0) return checked(ctx, name, SWITCH, 'unavailable',
    'SWITCH Domain Check reports this domain cannot be registered.', { reason: 'registry_reports_unavailable' });
  if (code === -1) return checked(ctx, name, SWITCH, 'invalid',
    'SWITCH rejected the domain enquiry.', { reason: 'registry_rejects_name' });
  if (code === -95) return checked(ctx, name, SWITCH, 'unknown',
    'SWITCH restricted access. A conservative 60-second cooldown is estimated; no reset time was supplied.',
    { reason: 'rate_limited', retryAfterMs: 60_000 });
  if (code === -99) return checked(ctx, name, SWITCH, 'unknown',
    'SWITCH reported a temporary server error.', { reason: 'registry_error' });
  return malformed(ctx, name, SWITCH);
}

/** https://www.nic.ch/whois/domaincheck/ */
export function createSwitchProvider(ctx: ProviderContext): DomainProvider {
  return {
    // Local conservative pacing, not a claimed registry-published numeric quota.
    id: SWITCH, batchSize: 1, minIntervalMs: 250, concurrency: 2,
    supports: async (name) => name.suffix === 'ch' || name.suffix === 'li',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          return switchResult(ctx, name, await ctx.whois('whois.nic.ch', name.domain, 4343));
        } catch { return transportFailure(ctx, name, SWITCH); }
      }));
    },
  };
}
