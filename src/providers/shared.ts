import { domainToASCII } from 'node:url';
import {
  asRecord, result, type DomainName, type DomainResult,
  type HttpResult, type ProviderContext,
} from '../types.js';

export function checked(
  ctx: ProviderContext, name: DomainName, source: string,
  status: DomainResult['status'], evidence: string,
  extra: Partial<DomainResult> = {},
): DomainResult {
  return result(name, source, status, evidence, {
    checkedAt: new Date(ctx.now()).toISOString(), ...extra,
  });
}

export function sameDomain(value: unknown, name: DomainName): boolean {
  return typeof value === 'string'
    && domainToASCII(value.trim().replace(/\.$/, '').toLowerCase()) === name.domain;
}

export function retryAfter(response: HttpResult, now: number): number | undefined {
  const header = response.headers.get('retry-after');
  if (header !== null) {
    const seconds = Number(header);
    if (header.trim() && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const body = asRecord(response.body);
  if (typeof body.retryAfter === 'number' && body.retryAfter >= 0) {
    return body.retryAfter * 1000;
  }
  return undefined;
}

export function httpFailure(
  ctx: ProviderContext, name: DomainName, source: string, response: HttpResult,
): DomainResult {
  const delay = retryAfter(response, ctx.now());
  return checked(ctx, name, source, 'unknown',
    `The source returned HTTP ${response.status}; availability was not established.`, {
      reason: response.status === 429 ? 'rate_limited' : `http_${response.status}`,
      ...(delay === undefined ? {} : { retryAfterMs: delay }),
    });
}

export function malformed(ctx: ProviderContext, name: DomainName, source: string): DomainResult {
  return checked(ctx, name, source, 'unknown',
    'The source returned an incomplete or unrecognized response.', { reason: 'invalid_response' });
}

export function transportFailure(ctx: ProviderContext, name: DomainName, source: string): DomainResult {
  return checked(ctx, name, source, 'unknown',
    'The source could not be reached or the request timed out.', { reason: 'request_failed' });
}

export function amount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** One successful metadata fetch per provider instance; failed fetches can retry. */
export function memoizeAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= load().catch((error: unknown) => { pending = undefined; throw error; });
    return pending;
  };
}
