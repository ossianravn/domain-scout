import { domainToASCII } from 'node:url';
import bundledSnapshot from './data/registry-snapshot.json' with { type: 'json' };
import { asRecord, type ProviderContext } from './types.js';

export const IANA_REGISTRY_URL = 'https://data.iana.org/TLD/v1/tlds.json';

export interface RegistryRoute {
  suffix: string;
  type: string;
  rdapUrls: string[];
  whoisServer?: string;
}

export interface RegistrySnapshot {
  generatedAt: string;
  source: string;
  routes: RegistryRoute[];
}

// Official registry endpoints absent from the current IANA RDAP bootstrap.
export const supplementalRdap = [
  { suffix: 'de', url: 'https://rdap.denic.de/', source: 'https://www.denic.de/en/rdap-master/' },
  { suffix: 'ch', url: 'https://rdap.nic.ch/', source: 'https://www.nic.ch/whois/rdap/' },
  { suffix: 'li', url: 'https://rdap.nic.ch/', source: 'https://www.nic.ch/whois/rdap/' },
] as const;

function dnsName(input: string): string | undefined {
  const text = input.trim().replace(/^\./, '').replace(/\.$/, '').toLowerCase();
  if (!text || /[\s/:@?#%\\]/u.test(text)) return undefined;
  const name = domainToASCII(text);
  return name && name.length <= 253 && name.split('.').every(label =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ? name : undefined;
}

function rdapUrl(input: unknown): string {
  if (typeof input !== 'string') throw new Error('invalid_registry_data');
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_registry_data');
  }
  return `${url.href.replace(/\/$/, '')}/`;
}

/** Project only active routing fields; registry contact details are not retained. */
export function parseRegistrySnapshot(value: unknown): RegistrySnapshot {
  const data = asRecord(value);
  const meta = asRecord(data.meta);
  if (typeof meta.generated !== 'string' || !Number.isFinite(Date.parse(meta.generated))
    || !Array.isArray(data.domains)) throw new Error('invalid_registry_data');
  const routes: RegistryRoute[] = [];
  const seen = new Set<string>();
  for (const raw of data.domains) {
    const entry = asRecord(raw);
    if (entry.status !== 'active') continue;
    const suffix = typeof entry.name === 'string' ? dnsName(entry.name) : undefined;
    if (!suffix || suffix.includes('.') || seen.has(suffix) || typeof entry.type !== 'string'
      || !entry.type || !Array.isArray(entry.rdap_base_urls)) throw new Error('invalid_registry_data');
    seen.add(suffix);
    const whoisServer = entry.whois_server == null ? undefined
      : typeof entry.whois_server === 'string' ? dnsName(entry.whois_server) : undefined;
    if (entry.whois_server != null && !whoisServer) throw new Error('invalid_registry_data');
    routes.push({ suffix, type: entry.type,
      rdapUrls: [...new Set(entry.rdap_base_urls.map(rdapUrl))],
      ...(whoisServer ? { whoisServer } : {}),
    });
  }
  if (!routes.length) throw new Error('invalid_registry_data');
  return { generatedAt: meta.generated, source: IANA_REGISTRY_URL,
    routes: routes.sort((a, b) => a.suffix.localeCompare(b.suffix)) };
}

const copy = (route: RegistryRoute): RegistryRoute => ({ ...route, rdapUrls: [...route.rdapUrls] });

export class RegistryCatalog {
  private snapshot: RegistrySnapshot;
  private routes = new Map<string, RegistryRoute>();
  private refreshing?: Promise<ReturnType<RegistryCatalog['refreshResult']>>;

  constructor(snapshot: RegistrySnapshot = bundledSnapshot) {
    this.snapshot = snapshot;
    this.install(snapshot);
  }

  private install(snapshot: RegistrySnapshot): void {
    const routes = new Map<string, RegistryRoute>();
    for (const route of snapshot.routes) {
      const suffix = dnsName(route.suffix);
      if (!suffix || routes.has(suffix)) throw new Error('invalid_registry_data');
      routes.set(suffix, { ...copy(route), suffix, rdapUrls: [...new Set(route.rdapUrls.map(rdapUrl))] });
    }
    if (!routes.size) throw new Error('invalid_registry_data');
    for (const supplement of supplementalRdap) {
      const route = routes.get(supplement.suffix);
      if (route && !route.rdapUrls.includes(supplement.url)) route.rdapUrls.push(supplement.url);
    }
    this.snapshot = snapshot;
    this.routes = routes;
  }

  lookup(domainOrSuffix: string): RegistryRoute | undefined {
    const name = dnsName(domainOrSuffix);
    if (!name) return undefined;
    const labels = name.split('.');
    for (let offset = 0; offset < labels.length; offset++) {
      const route = this.routes.get(labels.slice(offset).join('.'));
      if (route) return copy(route);
    }
    return undefined;
  }

  entries(): RegistryRoute[] { return [...this.routes.values()].map(copy); }

  summary() {
    const roots = [...this.routes.values()].filter(route => !route.suffix.includes('.'));
    const routedTlds = roots.filter(route => route.rdapUrls.length || route.whoisServer).length;
    return {
      activeTlds: roots.length,
      rdapTlds: roots.filter(route => route.rdapUrls.length).length,
      whoisTlds: roots.filter(route => route.whoisServer).length,
      routedTlds, unroutedTlds: roots.length - routedTlds,
      generatedAt: this.snapshot.generatedAt, source: this.snapshot.source,
    };
  }

  private refreshResult(refreshed: boolean, reason?: string) {
    return { refreshed, outcome: refreshed ? 'updated' : 'retained',
      ...(reason ? { reason } : {}), ...this.summary() };
  }

  async refresh(ctx: ProviderContext) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      let response;
      try { response = await ctx.request(IANA_REGISTRY_URL); }
      catch { return this.refreshResult(false, 'request_failed'); }
      if (response.status !== 200) return this.refreshResult(false, `http_${response.status}`);
      try {
        const snapshot = parseRegistrySnapshot(response.body);
        this.install(snapshot);
        return this.refreshResult(true);
      } catch { return this.refreshResult(false, 'invalid_registry_data'); }
    })();
    try { return await this.refreshing; }
    finally { this.refreshing = undefined; }
  }
}
