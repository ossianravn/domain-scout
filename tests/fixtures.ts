import { DomainEngine } from '../src/engine.js';
import { createProviders } from '../src/providers/index.js';
import { RegistryCatalog, type RegistryRoute } from '../src/registry-catalog.js';
import type { HttpResult, ProviderContext } from '../src/types.js';

export const registrar = 'https://api.vercel.com/v1/registrar';
export const bootstrapUrl = 'https://data.iana.org/rdap/dns.json';
export const rdapBase = 'https://rdap.registry.test/';

export function response(status: number, body: unknown,
  headers: Record<string, string> = {}): HttpResult {
  return { status, body, headers: new Headers(headers),
    text: typeof body === 'string' ? body : JSON.stringify(body) };
}

interface FixtureOptions {
  catalog?: string[];
  services?: [string[], string[]][];
  http?: (url: string, init?: RequestInit) => HttpResult | undefined;
  whois?: (host: string, query: string) => string | undefined;
  env?: Record<string, string | undefined>;
}

export function fixture(options: FixtureOptions = {}) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const whoisRequests: { host: string; query: string }[] = [];
  const unexpected: string[] = [];
  let now = Date.parse('2026-10-23T12:00:00Z');
  const context: ProviderContext = {
    env: { DOMAIN_SCOUT_DNS_RESOLVERS: '', ...options.env }, now: () => now,
    async request(url, init) {
      requests.push({ url, init });
      if (url === `${registrar}/tlds/supported`) return response(200, options.catalog ?? ['com']);
      if (url === bootstrapUrl) return response(200, {
        services: options.services ?? [[['com', 'org'], [rdapBase]]],
      });
      const reply = options.http?.(url, init);
      if (reply) return reply;
      unexpected.push(url);
      throw new Error('Unexpected mocked HTTP request');
    },
    async whois(host, query) {
      whoisRequests.push({ host, query });
      const reply = options.whois?.(host, query);
      if (reply !== undefined) return reply;
      unexpected.push(`${host} ${query}`);
      throw new Error('Unexpected mocked WHOIS request');
    },
  };
  const routes: RegistryRoute[] = (options.services ?? [[['com', 'org'], [rdapBase]]])
    .flatMap(([suffixes, urls]) => suffixes.map(suffix => ({ suffix, type: 'fixture', rdapUrls: urls })));
  const catalog = new RegistryCatalog({ generatedAt: new Date(now).toISOString(),
    source: bootstrapUrl, routes });
  const engine = new DomainEngine({ context, catalog, providers: createProviders(context, catalog), cacheTtlMs: 1000 });
  return { engine, requests, whoisRequests, unexpected,
    advance: (milliseconds: number) => { now += milliseconds; },
    searches: () => requests.filter(({ url }) => url === `${registrar}/domains/search`),
  };
}
