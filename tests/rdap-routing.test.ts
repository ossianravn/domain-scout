import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { DomainEngine } from '../src/engine.js';
import { createRdapProvider } from '../src/providers/rdap.js';
import { RegistryCatalog, type RegistryRoute } from '../src/registry-catalog.js';
import type { HttpResult, ProviderContext } from '../src/types.js';

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResult => ({
  status, body, text: typeof body === 'string' ? body : JSON.stringify(body), headers: new Headers(headers),
});
const record = (domain: string) => ({ objectClassName: 'domain', ldhName: domain });
function setup(routes: RegistryRoute[], request: ProviderContext['request']) {
  const context: ProviderContext = {
    env: {}, now: Date.now, request,
    whois: async () => { throw new Error('Unexpected WHOIS request'); },
  };
  const catalog = new RegistryCatalog({ generatedAt: '2026-10-24T00:00:00Z', source: 'fixture', routes });
  const provider = createRdapProvider(context, catalog);
  return new DomainEngine({ context, providers: [provider], cacheTtlMs: 0 });
}

test('alternate RDAP hosts recover failures while host queues isolate concurrency, deadlines and cooldown',
  { timeout: 3000 }, async t => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    t.after(() => release());
    const requests: string[] = [];
    const engine = setup([
      { suffix: 'com', type: 'generic', rdapUrls: ['https://shared.test/com/', 'https://alternate.test/rdap/'] },
      { suffix: 'net', type: 'generic', rdapUrls: ['https://shared.test/net/'] },
      { suffix: 'org', type: 'generic', rdapUrls: ['https://independent.test/'] },
    ], async (url, init) => {
      requests.push(url);
      assert.ok(init?.signal, 'The remaining lookup budget must reach the HTTP transport');
      const endpoint = new URL(url);
      const domain = endpoint.pathname.split('/').pop()!;
      if (domain.startsWith('hold')) await hold; // Intentionally uncooperative transport fixture.
      if (endpoint.hostname === 'shared.test' && domain === 'rate.com') {
        return reply(429, { errorCode: 429 }, { 'Retry-After': '60' });
      }
      return reply(200, record(domain));
    });

    const held = Array.from({ length: 5 }, (_, index) => `hold${index + 1}.com`);
    const first = await engine.check([...held, 'ready.org'], false, 60);
    assert.equal(first.results[5]?.status, 'registered');
    assert.equal(first.results[5]?.registry, 'independent.test');
    assert.ok(first.results.slice(0, 5).every(x => x.reason === 'time_budget_exhausted'));
    assert.equal(requests.filter(url => url.includes('/domain/hold')).length, 4);
    release();
    await nextTurn();
    assert.ok(!requests.some(url => url.endsWith('/hold5.com')), 'Expired queued work cannot start');

    const recovered = await engine.check(['rate.com']);
    assert.equal(recovered.results[0]?.status, 'registered');
    assert.equal(recovered.results[0]?.registry, 'alternate.test');
    assert.deepEqual(recovered.results[0]?.attempts, [
      { source: 'rdap', registry: 'shared.test', status: 'unknown', reason: 'rate_limited' },
    ]);
    const sharedCalls = requests.filter(url => url.startsWith('https://shared.test/')).length;
    const isolated = await engine.check(['another.com', 'waiting.net', 'still.org']);
    assert.deepEqual(isolated.results.map(x => [x.status, x.registry]), [
      ['registered', 'alternate.test'], ['unknown', 'shared.test'], ['registered', 'independent.test'],
    ]);
    assert.equal(isolated.results[1]?.reason, 'rate_limited');
    assert.ok((isolated.results[1]?.retryAfterMs ?? 0) > 0);
    assert.equal(requests.filter(url => url.startsWith('https://shared.test/')).length, sharedCalls,
      'Cooldown is shared across paths and TLDs of one registry host');
  });

test('RDAP negatives require unambiguous errors and SWITCH records do not imply registration', async () => {
  const responses: Record<string, HttpResult> = {
    'missing.com': reply(404, { errorCode: 404, title: 'Not Found' }),
    'html.com': reply(404, '<html>Not found</html>'),
    'wrong.com': reply(404, { errorCode: 404, ...record('different.com') }),
    'contradictory.com': reply(404, { errorCode: 404, ...record('contradictory.com') }),
    'namederror.com': reply(404, { errorCode: 404, ldhName: 'different.com' }),
    'matching.com': reply(200, { ...record('MATCHING.COM'), unicodeName: 'matching.com' }),
    'unicode.com': reply(200, { ...record('unicode.com'), unicodeName: 'different.com' }),
    'errorrecord.com': reply(200, { ...record('errorrecord.com'), errorCode: 404 }),
    'reserved.com': reply(200, { ...record('reserved.com'), status: ['reserved'] }),
    'record.ch': reply(200, record('record.ch')),
    'empty.ch': reply(404, ''),
    'html.ch': reply(404, '<html>Not found</html>'),
  };
  const engine = setup([
    { suffix: 'com', type: 'generic', rdapUrls: ['https://registry.test/'] },
    { suffix: 'ch', type: 'country-code', rdapUrls: [] },
  ], async url => {
    const parsed = new URL(url);
    const domain = parsed.pathname.split('/').pop()!;
    assert.equal(parsed.hostname, domain.endsWith('.ch') ? 'rdap.nic.ch' : 'registry.test');
    assert.ok(responses[domain], `Unexpected fixture request: ${domain}`);
    return responses[domain];
  });
  const output = await engine.check(Object.keys(responses));
  assert.deepEqual(output.results.map(x => [x.domain, x.status]), [
    ['missing.com', 'not_found'], ['html.com', 'unknown'], ['wrong.com', 'unknown'],
    ['contradictory.com', 'unknown'], ['namederror.com', 'unknown'], ['matching.com', 'registered'],
    ['unicode.com', 'unknown'], ['errorrecord.com', 'unknown'], ['reserved.com', 'unavailable'],
    ['record.ch', 'unavailable'], ['empty.ch', 'not_found'], ['html.ch', 'unknown'],
  ]);
  assert.ok(output.results.filter(x => x.status === 'unknown').every(x => x.reason === 'invalid_response'));
  assert.ok(output.results.filter(x => x.status === 'not_found')
    .every(x => /Registrability and pricing remain unverified/.test(x.evidence)));
  assert.ok(output.results.every(x => x.status !== 'available'));
});
