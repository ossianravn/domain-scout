import { asRecord, type DomainProvider, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

export function createIsnicProvider(ctx: ProviderContext): DomainProvider {
  return {
    id: 'isnic', batchSize: 1, minIntervalMs: 250, concurrency: 4,
    supports: async (name) => name.suffix === 'is',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          const response = await ctx.request(`https://rdap.isnic.is/rdap/dac/${encodeURIComponent(name.domain)}`);
          const body = asRecord(response.body);
          const description = Array.isArray(body.description) ? body.description : [];
          if (response.status === 404 && body.errorCode === 404
            && description.some((value) => typeof value === 'string' && /^available$/i.test(value.trim()))) {
            return checked(ctx, name, 'isnic', 'available',
              'ISNIC’s dedicated availability service explicitly reports this domain available.');
          }
          if (response.status === 200 && body.objectClassName === 'domain'
            && sameDomain(body.ldhName ?? body.unicodeName, name)) {
            return checked(ctx, name, 'isnic', 'unavailable',
              'ISNIC’s availability service reports this domain unavailable; it may exist or be pending.',
              { reason: 'registry_reports_unavailable' });
          }
          return response.status === 200 || response.status === 404
            ? malformed(ctx, name, 'isnic') : httpFailure(ctx, name, 'isnic', response);
        } catch {
          return transportFailure(ctx, name, 'isnic');
        }
      }));
    },
  };
}
