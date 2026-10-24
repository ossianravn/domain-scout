import { asRecord, type DomainProvider, type ProviderContext } from '../types.js';
import { checked, httpFailure, malformed, sameDomain, transportFailure } from './shared.js';

export function createSimplyProvider(ctx: ProviderContext): DomainProvider {
  const apiKey = ctx.env.SIMPLY_API_KEY?.trim() || ctx.env.SIMPLY_API_TOKEN?.trim();
  return {
    id: 'simply', batchSize: 1, minIntervalMs: 0, concurrency: 4,
    supports: async (name) => Boolean(apiKey) && name.suffix === 'dk',
    async check(names) {
      return Promise.all(names.map(async (name) => {
        if (!apiKey) return checked(ctx, name, 'simply', 'unsupported',
          'Simply.com lookup requires an API key.', { reason: 'credentials_not_configured' });
        try {
          const url = `https://api.simply.com/2/my/domaincheck/${encodeURIComponent(name.domain)}/`;
          const response = await ctx.request(url, {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          });
          if (response.status !== 200) return httpFailure(ctx, name, 'simply', response);
          const body = asRecord(response.body);
          const domain = asRecord(body.domain);
          if ((body.status !== undefined && body.status !== 200) || !sameDomain(domain.name, name)
            || typeof domain.available !== 'boolean' || typeof domain.canregister !== 'boolean') {
            return malformed(ctx, name, 'simply');
          }
          if (domain.available && domain.canregister) return checked(ctx, name, 'simply', 'available',
            'Simply.com reports this domain available and eligible for registration.');
          if (!domain.available && domain.canregister) return malformed(ctx, name, 'simply');
          return checked(ctx, name, 'simply', 'unavailable',
            'Simply.com reports this domain ineligible for registration.', {
              reason: domain.available ? 'registration_restricted' : 'provider_reports_unavailable',
            });
        } catch {
          return transportFailure(ctx, name, 'simply');
        }
      }));
    },
  };
}
