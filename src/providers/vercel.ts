import { domainToASCII } from 'node:url';
import { asRecord, type DomainProvider, type ProviderContext } from '../types.js';
import { amount, checked, httpFailure, malformed, memoizeAsync, transportFailure } from './shared.js';

const origin = 'https://api.vercel.com/v1/registrar';

export function createVercelProvider(ctx: ProviderContext): DomainProvider {
  const catalog = memoizeAsync(async () => {
    const response = await ctx.request(`${origin}/tlds/supported`);
    if (response.status !== 200 || !Array.isArray(response.body) || !response.body.length
      || response.body.some((entry) => typeof entry !== 'string')) {
      throw new Error('Vercel supported-extension catalog is unavailable.');
    }
    return new Set((response.body as string[]).map((entry) => entry.toLowerCase().replace(/^\./, '')));
  });

  return {
    id: 'vercel', batchSize: 200, minIntervalMs: 0, concurrency: 2,
    supports: async (name) => (await catalog()).has(name.suffix),
    async check(names) {
      try {
        const tlds = await catalog();
        const supported = names.filter((name) => tlds.has(name.suffix));
        const response = supported.length ? await ctx.request(`${origin}/domains/search`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: supported.map((name) => name.domain) }),
        }) : undefined;
        const body = asRecord(response?.body);
        const rows = Array.isArray(body.results) ? body.results.map(asRecord) : [];
        const entries = new Map<string, Record<string, unknown>[]>();
        for (const row of rows) {
          if (typeof row.domain !== 'string') continue;
          const key = domainToASCII(row.domain.trim().replace(/\.$/, '').toLowerCase());
          entries.set(key, [...(entries.get(key) ?? []), row]);
        }
        return names.map((name) => {
          if (!tlds.has(name.suffix)) return checked(ctx, name, 'vercel', 'unsupported',
            'This extension is absent from Vercel’s supported-extension catalog.',
            { reason: 'extension_not_supported' });
          if (!response) return malformed(ctx, name, 'vercel');
          if (response.status !== 200) return httpFailure(ctx, name, 'vercel', response);
          const matches = entries.get(name.domain);
          if (matches?.length !== 1) return malformed(ctx, name, 'vercel');
          const row = matches[0]!;
          if (typeof row.available !== 'boolean') return malformed(ctx, name, 'vercel');
          if (!row.available) return checked(ctx, name, 'vercel', 'unavailable',
            'Vercel reports this domain unavailable for registration on a supported extension.',
            { reason: 'provider_reports_unavailable' });
          const years = amount(row.years);
          return checked(ctx, name, 'vercel', 'available',
            'Vercel reports this domain available for registration.', {
              pricing: {
                currency: 'USD', registration: amount(row.price),
                registrationYears: years !== null && years > 0 ? years : null,
                renewal: amount(row.renewalPrice), renewalYears: null,
                premium: typeof row.premium === 'boolean' ? row.premium : null,
              },
            });
        });
      } catch {
        return names.map((name) => transportFailure(ctx, name, 'vercel'));
      }
    },
  };
}
