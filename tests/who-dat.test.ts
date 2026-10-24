import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainEngine } from '../src/engine.js';
import { normalizeDomain, isDomainName } from '../src/normalize.js';
import { createWhoDatProvider } from '../src/providers/who-dat.js';
import type { HttpResult, ProviderContext } from '../src/types.js';
import { response } from './fixtures.js';

function service(replies: Record<string, HttpResult>) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const context: ProviderContext = {
    env: { DOMAIN_SCOUT_WHO_DAT_URL: 'http://localhost:8080/scout/', DOMAIN_SCOUT_WHO_DAT_TOKEN: 'fixture-secret' },
    now: () => Date.parse('2026-10-24T12:00:00Z'),
    async request(url, init) {
      requests.push({ url, init });
      const reply = replies[new URL(url).pathname.split('/').pop()!];
      if (!reply) throw new Error('Fixture transport failure');
      return reply;
    },
    async whois() { throw new Error('Who-Dat uses HTTP only'); },
  };
  const provider = createWhoDatProvider(context);
  provider.minIntervalMs = 0;
  const engine = new DomainEngine({ context, providers: [provider] });
  return { context, provider, engine, requests };
}

const lookup = (domain: string, isRegistered: boolean, cached = true) => ({
  query: domain, domain, isRegistered,
  meta: { source: 'rdap', server: 'https://rdap.registry.test/',
    fetchedAt: '2026-10-24T11:10:00Z', cached },
});

test('optional proxy preserves observation age and never promotes collapsed negatives to availability', async () => {
  const f = service({
    'xn--bger-gra.com': response(200, lookup('XN--BGER-GRA.COM', true, false), { Age: '35' }),
    'reserved.com': response(200, lookup('reserved.com', false)),
  });
  const output = await f.engine.check(['BØGER.COM.', 'reserved.com']);
  assert.deepEqual(output.results.map(x => [x.domain, x.status, x.source]), [
    ['xn--bger-gra.com', 'registered', 'who-dat'], ['reserved.com', 'unknown', 'who-dat'],
  ]);
  const known = output.results[0]!;
  assert.equal(known.observedAt, '2026-10-24T11:10:00.000Z');
  assert.equal(known.checkedAt, '2026-10-24T12:00:00.000Z');
  assert.equal(known.upstreamCached, true);
  assert.equal(known.registry, 'rdap.registry.test');
  assert.match(known.evidence, /does not bypass its cache/);
  assert.equal(output.results[1]?.reason, 'ambiguous_registration_status');
  assert.equal(JSON.stringify(output).includes('fixture-secret'), false);
  assert.ok(f.requests.every(x => x.url.startsWith('http://localhost:8080/scout/v1/whois/')));
  assert.ok(f.requests.every(x => new Headers(x.init?.headers).get('Authorization') === 'Bearer fixture-secret'));
  const refreshed = await f.engine.check(['xn--bger-gra.com'], true);
  assert.equal(refreshed.results[0]?.observedAt, known.observedAt);
  assert.equal(refreshed.results[0]?.upstreamCached, true);
});

test('untrusted replies, errors, disabled configuration and expired deadlines cannot manufacture availability', async () => {
  const f = service({
    'mismatch.com': response(200, { ...lookup('mismatch.com', true), domain: 'other.com' }),
    'missing.com': response(404, { errorCode: 404, title: 'Not Found' }),
    'html.com': response(200, '<html>Not found</html>'),
    'parser.com': response(502, { error: { code: 'UPSTREAM_ERROR' } }),
    'limited.com': response(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '60' }),
    'error.com': response(200, { ...lookup('error.com', true), error: { code: 'UPSTREAM_ERROR' } }),
  });
  const output = await f.engine.check(['mismatch.com', 'missing.com', 'html.com', 'parser.com',
    'error.com', 'transport.com', 'limited.com']);
  assert.ok(output.results.every(x => x.status === 'unknown'));
  assert.deepEqual(output.results.map(x => x.reason), [
    'invalid_response', 'http_404', 'invalid_response', 'http_502', 'invalid_response', 'request_failed', 'rate_limited',
  ]);
  assert.equal(output.results[6]?.retryAfterMs, 60_000);
  const name = normalizeDomain('deadline.com');
  assert.ok(isDomainName(name));
  const count = f.requests.length;
  const expired = await f.provider.check([name], { deadline: Date.now() - 1 });
  assert.equal(expired[0]?.reason, 'time_budget_exhausted');
  const disabled = createWhoDatProvider({ ...f.context, env: {} });
  assert.equal(await disabled.supports(name), false);
  assert.equal((await disabled.check([name]))[0]?.status, 'unsupported');
  assert.equal(f.requests.length, count);
  assert.throws(() => createWhoDatProvider({ ...f.context, env: {
    DOMAIN_SCOUT_WHO_DAT_URL: 'https://owner:secret@example.test/',
  } }), error => error instanceof Error && !error.message.includes('secret'));
});
