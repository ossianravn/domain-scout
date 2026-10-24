import { type DomainProvider, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

export function createIisProvider(ctx: ProviderContext): DomainProvider {
  return {
    id: 'internetstiftelsen', batchSize: 1, minIntervalMs: 30, concurrency: 4,
    supports: async (name) => name.suffix === 'se' || name.suffix === 'nu',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          // The registry documents HTTP for Free; HTTPS support is unverified.
          const response = await ctx.request(`http://free.iis.${name.suffix}/free?q=${encodeURIComponent(name.domain)}`);
          if (response.status !== 200) return httpFailure(ctx, name, 'internetstiftelsen', response);
          const match = /^(free|occupied)\s+(\S+)\s*$/i.exec(response.text.trim());
          if (!match || !sameDomain(match[2], name)) return malformed(ctx, name, 'internetstiftelsen');
          return checked(ctx, name, 'internetstiftelsen', match[1]!.toLowerCase() === 'free' ? 'available' : 'registered',
            `Internetstiftelsen’s Free service reports this domain ${match[1]!.toLowerCase()} (HTTP transport).`);
        } catch {
          return transportFailure(ctx, name, 'internetstiftelsen');
        }
      }));
    },
  };
}
