import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainEngine } from '../src/engine.js';
import { RegistryCatalog } from '../src/registry-catalog.js';
import { createWhoisProvider } from '../src/providers/whois.js';
import type { ProviderContext } from '../src/types.js';

function fixture(replies: Record<string, string | (() => Promise<string>)>, spacing = 0) {
  const hosts = { com: 'whois.verisign-grs.com', net: 'whois.verisign-grs.com',
    de: 'whois.denic.de', jp: 'whois.jprs.jp', org: 'whois.registry.test', cz: 'whois.nic.cz',
    dk: 'whois.punktum.dk', be: 'whois.dns.be', pl: 'whois.dns.pl' };
  const catalog = new RegistryCatalog({ generatedAt: '2026-10-24T00:00:00Z', source: 'fixture',
    routes: Object.entries(hosts).map(([suffix, whoisServer]) => ({ suffix, whoisServer, type: 'test', rdapUrls: [] })) });
  const requests: { host: string; query: string }[] = [];
  const context: ProviderContext = {
    env: { DOMAIN_SCOUT_WHOIS_INTERVAL_MS: String(spacing) }, now: () => Date.now(),
    async request() { throw new Error('Unexpected HTTP request'); },
    async whois(host, query) {
      requests.push({ host, query });
      const reply = replies[query];
      if (reply === undefined) throw new Error('Unexpected WHOIS request');
      return typeof reply === 'function' ? reply() : reply;
    },
  };
  return { requests, engine: new DomainEngine({ context, providers: [createWhoisProvider(context, catalog)] }) };
}

test('WHOIS preserves evidence, selects registry dialects and never promotes no-record to available', async () => {
  const f = fixture({
    'domain taken.com': 'Domain Name: TAKEN.COM\nRegistry Domain ID: 123_DOMAIN_COM-VRSN\nCreation Date: 2020-01-01T00:00:00Z\nRegistrant Email: private@example.org\n% No match found.\n',
    'domain absent.com': 'No match for domain "ABSENT.COM".\n>>> Last update of whois database: 2026-10-24T00:00:00Z <<<\n',
    'domain mismatch.com': 'No match for domain "OTHER.COM".\n',
    'domain broken.net': 'This service is free of charge. If no match is found, try again.\n',
    '-T dn,ace reserved.de': 'Domain: reserved.de\nStatus: reserved\n',
    '-T dn,ace missing.de': 'Domain: missing.de\nStatus: free\n',
    '-T dn,ace active.de': 'Domain: active.de\nStatus: connect\n',
    'taken.jp/e': 'Domain Information:\n[Domain Name] TAKEN.JP\n\n[Created on] 2020/01/01\n[Status] Active\n',
    'absent.jp/e': '[ JPRS database information ]\nNo match!!\n',
    'mismatch.org': 'Domain Name: other.org\nRegistry Domain ID: 456\n',
    'stub.cz': 'domain: stub.cz\n\ncontact: SOMEONE\ncreated: 2001-01-01\n',
    'limited.org': 'Your connection limit exceeded. Please slow down and try again later.\n',
  });
  const domains = ['taken.com', 'absent.com', 'mismatch.com', 'broken.net', 'reserved.de', 'missing.de',
    'active.de', 'taken.jp', 'absent.jp', 'mismatch.org', 'stub.cz', 'limited.org', 'skip.dk', 'skip.be', 'skip.pl'];
  const output = await f.engine.check(domains);
  assert.deepEqual(output.results.map(item => item.status), ['registered', 'not_found', 'unknown', 'unknown',
    'unavailable', 'not_found', 'registered', 'registered', 'not_found', 'unknown', 'unknown', 'unknown',
    'unsupported', 'unsupported', 'unsupported']);
  assert.equal(output.results[2]?.reason, 'domain_mismatch');
  assert.equal(output.results[11]?.reason, 'rate_limited');
  assert.equal(output.results[11]?.retryAfterMs, 60_000);
  assert.equal(output.results[0]?.registry, 'whois.verisign-grs.com');
  assert.match(output.results[1]?.evidence ?? '', /Registrability and pricing remain unverified/);
  assert.equal(JSON.stringify(output).includes('private@example.org'), false);
  assert.equal(f.requests.length, 12);
  assert.deepEqual(f.requests.filter(item => item.host === 'whois.denic.de').map(item => item.query),
    ['-T dn,ace reserved.de', '-T dn,ace missing.de', '-T dn,ace active.de']);
  const retry = await f.engine.check(['later.org']);
  assert.equal(retry.results[0]?.reason, 'rate_limited');
  assert.equal(f.requests.length, 12);
});

test('WHOIS schedules independently per host and never starts queued requests after the wait budget', async () => {
  let release!: (value: string) => void;
  const pending = new Promise<string>(resolve => { release = resolve; });
  const f = fixture({
    'domain slow.com': () => pending,
    '-T dn,ace quick.de': 'Domain: quick.de\nStatus: connect\n',
  }, 250);
  const first = await f.engine.check(['slow.com', 'queued.net', 'quick.de'], false, 40);
  assert.equal(first.results[2]?.status, 'registered');
  assert.equal(first.results[1]?.reason, 'time_budget_exhausted');
  assert.equal(f.requests.length, 2);
  release('Domain Name: slow.com\nRegistry Domain ID: 789_DOMAIN_COM-VRSN\n');
  const completed = await f.engine.check(['slow.com'], false, 250);
  assert.equal(completed.results[0]?.status, 'registered');
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(item => item.query !== 'domain queued.net'));
});
