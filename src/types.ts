export type Availability =
  | 'available' | 'likely_taken' | 'registered' | 'unavailable' | 'not_found'
  | 'unsupported' | 'unknown' | 'invalid';

export interface DomainName {
  domain: string;
  displayDomain: string;
  suffix: string;
  hostnameLength: number;
  labelLength: number;
}

export interface DomainPricing {
  currency: string;
  registration: number | null;
  registrationYears: number | null;
  renewal: number | null;
  renewalYears: number | null;
  premium: boolean | null;
}

export interface DomainResult {
  domain: string;
  status: Availability;
  source: string;
  checkedAt: string;
  evidence: string;
  reason?: string;
  pricing?: DomainPricing;
  displayDomain?: string;
  hostnameLength?: number;
  labelLength?: number;
  cached?: boolean;
  retryAfterMs?: number;
  durationMs?: number;
  registry?: string;
  observedAt?: string;
  upstreamCached?: boolean;
  attempts?: { source: string; status: Availability; reason?: string; registry?: string }[];
}

export interface HttpResult {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

export interface ProviderContext {
  request(url: string, init?: RequestInit): Promise<HttpResult>;
  whois(host: string, query: string, port?: number): Promise<string>;
  env: Record<string, string | undefined>;
  now(): number;
}

export interface DomainProvider {
  id: string;
  batchSize: number;
  minIntervalMs: number;
  concurrency: number;
  managesScheduling?: boolean;
  supports(name: DomainName): Promise<boolean>;
  check(names: DomainName[], options?: { deadline?: number }): Promise<DomainResult[]>;
}

export function result(
  name: DomainName, source: string, status: Availability,
  evidence: string, extra: Partial<DomainResult> = {},
): DomainResult {
  return {
    domain: name.domain, displayDomain: name.displayDomain,
    hostnameLength: name.hostnameLength, labelLength: name.labelLength,
    source, status, checkedAt: new Date().toISOString(), evidence, ...extra,
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
