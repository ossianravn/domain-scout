import { parseDnsResolvers } from './providers/dns-screen.js';
import { RegistryCatalog } from './registry-catalog.js';
import { normalizeDomainSuffix } from './shortnames.js';
import { genericWhoisExcludedSuffixes } from './providers/whois.js';
import type { ProviderContext } from './types.js';

const dedicated = [
  { source: 'punktum-whois', suffixes: ['dk'], protocol: 'WHOIS', evidence: 'Registration or no-record evidence; no purchase guarantee.' },
  { source: 'isnic', suffixes: ['is'], protocol: 'HTTPS DAC', evidence: 'Explicit registry availability.' },
  { source: 'internetstiftelsen', suffixes: ['se', 'nu'], protocol: 'HTTP Free', evidence: 'Explicit registry availability.' },
  { source: 'dnsbelgium-das', suffixes: ['be'], protocol: 'TCP 4343 DAS', evidence: 'Explicit registry availability.' },
  { source: 'switch-domaincheck', suffixes: ['ch', 'li'], protocol: 'TCP 4343 Domain Check', evidence: 'Explicit registry availability.' },
  { source: 'sidn', suffixes: ['nl'], protocol: 'HTTPS RDAP', evidence: 'Explicit free status; other records can be registered or withheld.' },
];

export async function describeSources(catalog: RegistryCatalog, ctx: ProviderContext,
  tlds: string[] = [], refresh = false) {
  const suffixes = [...new Set(tlds.map(normalizeDomainSuffix))];
  const refreshed = refresh ? await catalog.refresh(ctx) : undefined;
  const resolvers = parseDnsResolvers(ctx.env.DOMAIN_SCOUT_DNS_RESOLVERS);
  return {
    screening: {
      enabled: resolvers.length > 0, resolvers: resolvers.map(resolver => new URL(resolver).hostname),
      appliesTo: 'Names whose first source is paced: .dk, .nl, .be and WHOIS-only routes.',
      evidence: 'likely_taken means DNS lists nameservers for the exact name; registration is not confirmed.',
    },
    catalog: catalog.summary(),
    ...(refreshed ? { refresh: refreshed } : {}),
    extensions: suffixes.map(suffix => {
      const route = catalog.lookup(suffix);
      return {
        suffix, publishedRoute: route ?? null,
        genericRdapEnabled: !['is', 'nl'].includes(suffix) && Boolean(route?.rdapUrls.length),
        genericWhoisEnabled: !genericWhoisExcludedSuffixes.has(suffix.split('.').at(-1)!) && Boolean(route?.whoisServer),
        dedicatedChecks: dedicated.filter(item => item.suffixes.includes(suffix)).map(item => item.source),
      };
    }),
    dedicatedSources: dedicated,
    registrarSearch: {
      source: 'vercel', credentialsRequired: false, batchSize: 200,
      coverage: 'Supported extensions are discovered from Vercel during lookup. Coverage does not establish availability.',
    },
    optionalSources: [
      { source: 'simply', enabled: Boolean(ctx.env.SIMPLY_API_KEY || ctx.env.SIMPLY_API_TOKEN), suffixes: ['dk'], evidence: 'Explicit registrar availability with canregister.' },
      { source: 'who-dat', enabled: Boolean(ctx.env.DOMAIN_SCOUT_WHO_DAT_URL), evidence: 'Optional self-hosted RDAP/WHOIS fallback. Negative boolean results remain unknown.' },
    ],
    interpretation: 'Catalog counts describe published routing metadata, not live service health, successful parser coverage, or open registration. Generic RDAP/WHOIS negatives are not_found, not available. This tool does not probe registries; refresh fetches IANA routing data explicitly.',
  };
}
