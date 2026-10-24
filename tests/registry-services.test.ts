import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainEngine } from '../src/engine.js';
import { createBelgiumProvider, createSwitchProvider } from '../src/providers/das.js';
import { createSidnProvider } from '../src/providers/sidn.js';
import type { DomainProvider, HttpResult, ProviderContext } from '../src/types.js';
import { response } from './fixtures.js';

function registryFixture(factory: (ctx: ProviderContext) => DomainProvider, options: {
  tcp?: Record<string, string>; http?: Record<string, HttpResult>;
}) {
  const tcpRequests: { host: string; query: string; port?: number }[] = [];
  const httpRequests: string[] = [];
  const context: ProviderContext = {
    env: {}, now: () => Date.now(),
    async whois(host, query, port) {
      tcpRequests.push({ host, query, port });
      const reply = options.tcp?.[query];
      if (reply === undefined) throw new Error('Unexpected TCP request');
      return reply;
    },
    async request(url) {
      httpRequests.push(url);
      const reply = options.http?.[url];
      if (reply === undefined) throw new Error('Unexpected HTTP request');
      return reply;
    },
  };
  const provider = factory(context);
  // Exercise real routing and cooldowns without adding real pacing to fixture tests.
  const engine = new DomainEngine({ context, providers: [{ ...provider, minIntervalMs: 0, concurrency: 1 }] });
  return { engine, provider, tcpRequests, httpRequests };
}

test('Belgium DAS requires a matching successful response and preserves registry rejection and cooldown', async () => {
  const reply = (domain: string, status: string) => `% .be Domain Availability Server 4.0\n%% RC=0\nDomain: ${domain}\nStatus: ${status}\n`;
  const f = registryFixture(createBelgiumProvider, { tcp: {
    'ready.be': reply('ready.be', 'AVAILABLE'),
    'taken.be': reply('taken.be', 'NOT AVAILABLE'),
    'invalid.be': reply('invalid.be', 'NOT ALLOWED'),
    'mismatch.be': reply('other.be', 'AVAILABLE'),
    'broken.be': '<html>AVAILABLE</html>',
    'contradictory.be': `${reply('contradictory.be', 'AVAILABLE')}Status: REGISTERED\n`,
    'blocked.be': '%% RC=-3\n',
    'limited.be': '%% RC=-2\n% Excessive querying\nDomain: limited.be\n',
  } });
  assert.equal(f.provider.minIntervalMs, 1200);
  const output = await f.engine.check(['ready.be', 'taken.be', 'invalid.be', 'mismatch.be',
    'broken.be', 'contradictory.be', 'blocked.be', 'limited.be']);
  assert.deepEqual(output.results.map(item => item.status),
    ['available', 'registered', 'invalid', 'unknown', 'unknown', 'unknown', 'unknown', 'unknown']);
  assert.ok(output.results.slice(3, 6).every(item => item.reason === 'invalid_response'));
  assert.equal(output.results[6]?.reason, 'access_blocked');
  assert.equal(output.results[7]?.reason, 'rate_limited');
  assert.equal(output.results[7]?.retryAfterMs, 60_000);
  assert.ok(f.tcpRequests.every(item => item.host === 'das.dns.be' && item.port === 4343));
  assert.equal(f.httpRequests.length, 0);
  const retry = await f.engine.check(['later.be']);
  assert.equal(retry.results[0]?.reason, 'rate_limited');
  assert.equal(f.tcpRequests.length, 8);
});

test('SWITCH uses protocol codes for both CH and LI and never infers availability from prose', async () => {
  const f = registryFixture(createSwitchProvider, { tcp: {
    'ready.ch': '1: Domain name can be registered\n',
    'taken.li': '0: Domain name cannot be registered\nReason: reserved\n',
    'invalid.ch': '-1: Invalid enquiry\n',
    'error.li': '-99: Temporary server error\n',
    'broken.ch': '<html>This domain name can be registered</html>',
    'contradictory.li': '1: Available\n0: Unavailable\n',
    'limited.ch': '-95: Access restricted\n',
  } });
  const output = await f.engine.check(['ready.ch', 'taken.li', 'invalid.ch', 'error.li',
    'broken.ch', 'contradictory.li', 'limited.ch']);
  assert.deepEqual(output.results.map(item => item.status),
    ['available', 'unavailable', 'invalid', 'unknown', 'unknown', 'unknown', 'unknown']);
  assert.equal(output.results[3]?.reason, 'registry_error');
  assert.ok(output.results.slice(4, 6).every(item => item.reason === 'invalid_response'));
  assert.equal(output.results[6]?.reason, 'rate_limited');
  assert.equal(output.results[6]?.retryAfterMs, 60_000);
  assert.ok(f.tcpRequests.every(item => item.host === 'whois.nic.ch' && item.port === 4343));
  assert.equal(f.httpRequests.length, 0);
});

test('SIDN promotes only an explicit matching free status and keeps withheld names unavailable', async () => {
  const base = 'https://rdap.sidn.nl/domain/';
  const record = (domain: string, status: string[]) => ({ objectClassName: 'domain', ldhName: domain, status });
  const f = registryFixture(createSidnProvider, { http: {
    [`${base}ready.nl`]: response(404, record('ready.nl', ['free'])),
    [`${base}taken.nl`]: response(200, record('taken.nl', ['active'])),
    [`${base}withheld.nl`]: response(200, record('withheld.nl', ['reserved'])),
    [`${base}plain.nl`]: response(404, { errorCode: 404, title: 'Not found' }),
    [`${base}broken.nl`]: response(404, '<html>Not found</html>'),
    [`${base}mismatch.nl`]: response(404, record('other.nl', ['free'])),
    [`${base}contradictory.nl`]: response(404, record('contradictory.nl', ['free', 'active'])),
    [`${base}limited.nl`]: response(429, {}, { 'Retry-After': '120' }),
  } });
  const output = await f.engine.check(['ready.nl', 'taken.nl', 'withheld.nl', 'plain.nl',
    'broken.nl', 'mismatch.nl', 'contradictory.nl', 'limited.nl']);
  assert.deepEqual(output.results.map(item => item.status),
    ['available', 'unavailable', 'unavailable', 'not_found', 'unknown', 'unknown', 'unknown', 'unknown']);
  assert.ok(output.results.slice(4, 7).every(item => item.reason === 'invalid_response'));
  assert.equal(output.results[7]?.reason, 'rate_limited');
  assert.equal(output.results[7]?.retryAfterMs, 120_000);
  assert.equal(f.tcpRequests.length, 0);
  assert.equal(f.httpRequests.length, 8);
});
