import { asRecord, type DomainProvider, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

/** SIDN RDAP Manual v1.4, section 2.1: domain 404 is free; 200 can also be withheld. */
export function createSidnProvider(ctx: ProviderContext): DomainProvider {
  return {
    id: 'sidn', batchSize: 1, minIntervalMs: 100, concurrency: 4,
    supports: async (name) => name.suffix === 'nl',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        try {
          const response = await ctx.request(`https://rdap.sidn.nl/domain/${encodeURIComponent(name.domain)}`,
            { headers: { Accept: 'application/rdap+json, application/json' } });
          const body = asRecord(response.body);
          const validStates = body.status === undefined || (Array.isArray(body.status)
            && body.status.every(value => typeof value === 'string'));
          const matching = validStates && body.objectClassName === 'domain' && sameDomain(body.ldhName, name)
            && (body.unicodeName === undefined || sameDomain(body.unicodeName, name));
          const states = Array.isArray(body.status) && body.status.every(value => typeof value === 'string')
            ? body.status.map(value => (value as string).trim().toLowerCase()) : [];
          // Verified SIDN wire format: a matching domain object, HTTP 404, status ["free"].
          if (response.status === 404 && matching && states.length === 1 && states[0] === 'free') {
            return checked(ctx, name, 'sidn', 'available',
              'SIDN explicitly reports the matching .nl domain free in its RDAP status.');
          }
          if (response.status === 200 && matching && !states.includes('free')) {
            return checked(ctx, name, 'sidn', 'unavailable',
              'SIDN returned a matching domain record. It may be registered, withheld or excluded from registration.',
              { reason: 'registry_reports_unavailable' });
          }
          if (response.status === 404 && body.errorCode === 404 && body.objectClassName === undefined) {
            return checked(ctx, name, 'sidn', 'not_found',
              'SIDN returned a structured no-record response without an explicit free status. Registrability remains unverified.');
          }
          return response.status === 200 || response.status === 404
            ? malformed(ctx, name, 'sidn') : httpFailure(ctx, name, 'sidn', response);
        } catch { return transportFailure(ctx, name, 'sidn'); }
      }));
    },
  };
}
