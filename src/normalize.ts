import { domainToASCII, domainToUnicode } from 'node:url';
import { parse } from 'tldts';
import type { DomainName, DomainResult } from './types.js';

export function normalizeDomain(input: string): DomainName | DomainResult {
  const original = input.trim();
  const text = original.replace(/\.$/, '').normalize('NFC').toLowerCase();
  const invalid = (reason: string): DomainResult => ({
    domain: original, status: 'invalid', source: 'syntax',
    checkedAt: new Date().toISOString(), evidence: 'Input validation', reason,
  });
  if (!text || /[\s/:@?#%\\]/u.test(text)) {
    return invalid('Supply a domain name, such as example.com, without a URL path or protocol.');
  }
  const ascii = domainToASCII(text);
  if (!ascii || ascii.length > 253) return invalid('Domain does not have a valid DNS/IDNA representation.');
  const labels = ascii.split('.');
  if (labels.length < 2 || labels.some(label =>
    label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return invalid('Domain labels must follow DNS syntax and contain a registrable suffix.');
  }
  const parsed = parse(ascii, { allowPrivateDomains: false });
  if (parsed.isIp || !parsed.publicSuffix || !parsed.domain) {
    return invalid('Supply a registrable domain rather than an address or a suffix alone.');
  }
  if (parsed.subdomain) return invalid(`Check the registrable domain ${parsed.domain} instead of a subdomain.`);
  return {
    domain: ascii, displayDomain: domainToUnicode(ascii), suffix: parsed.publicSuffix,
    hostnameLength: ascii.length, labelLength: ascii.length - parsed.publicSuffix.length - 1,
  };
}

export function isDomainName(value: DomainName | DomainResult): value is DomainName {
  return 'suffix' in value;
}
