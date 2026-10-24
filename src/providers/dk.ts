import { type DomainProvider, type ProviderContext } from '../types.js';
import { checked, malformed, sameDomain, transportFailure } from './shared.js';

// Punktum WHOIS spec: 1 request per second per source IP; exceeding it triggers a
// temporary ban of unstated length. Pace with a margin and back off after a ban.
const BAN_COOLDOWN_MS = 10_000;

export function createDkProvider(ctx: ProviderContext): DomainProvider {
  return {
    id: 'punktum-whois', batchSize: 1, minIntervalMs: 1100, concurrency: 1,
    supports: async (name) => name.suffix === 'dk',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          const text = await ctx.whois('whois.punktum.dk', ` --charset=utf8 ${name.domain}`);
          const fields = new Map<string, string>();
          for (const line of text.split(/\r?\n/)) {
            const field = /^([A-Za-z ]+):\s*(.*?)\s*$/.exec(line);
            if (field && !fields.has(field[1]!.toLowerCase())) {
              fields.set(field[1]!.toLowerCase(), field[2]!);
            }
          }
          const matching = sameDomain(fields.get('dns'), name) || sameDomain(fields.get('domain'), name);
          const status = fields.get('status')?.toLowerCase();
          if (matching && status === 'offered to waiting list') {
            return checked(ctx, name, 'punktum-whois', 'unavailable',
              'Punktum has offered this domain to a waiting-list applicant.', { reason: 'waiting_list_offer' });
          }
          if (matching && status && ['active', 'deactivated', 'reserved'].includes(status)
            && /^\d{4}-\d{2}-\d{2}$/.test(fields.get('registered') ?? '')) {
            return checked(ctx, name, 'punktum-whois', 'registered',
              `Punktum returned a matching registration with status ${status}.`);
          }
          const lines = text.split(/\r?\n/).map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
          if (!fields.size && lines.length === 1
            && /^No entries found for the selected source\.$/i.test(lines[0]!)) {
            return checked(ctx, name, 'punktum-whois', 'not_found',
              'Punktum WHOIS returned no registration record. Registrar confirmation is still needed.');
          }
          if (lines.some((line) => /\b(rate limit|too many requests|temporarily banned)\b/i.test(line))) {
            return checked(ctx, name, 'punktum-whois', 'unknown',
              'Punktum declined the lookup because of its one-request-per-second limit; retry in about 10 seconds.',
              { reason: 'rate_limited', retryAfterMs: BAN_COOLDOWN_MS });
          }
          return malformed(ctx, name, 'punktum-whois');
        } catch {
          return transportFailure(ctx, name, 'punktum-whois');
        }
      }));
    },
  };
}
