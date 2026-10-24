import assert from 'node:assert/strict';
import test from 'node:test';
import { IANA_REGISTRY_URL, RegistryCatalog, type RegistrySnapshot } from '../src/registry-catalog.js';
import type { ProviderContext } from '../src/types.js';

test('catalog routes immediately, prefers specific suffixes, and retains last-good routes across refresh failures', async () => {
  const snapshot: RegistrySnapshot = { generatedAt: '2026-10-01T00:00:00Z', source: 'fixture', routes: [
    { suffix: 'uk', type: 'country-code', rdapUrls: ['https://rdap.example.test/uk/'] },
    { suffix: 'co.uk', type: 'second-level', rdapUrls: ['https://rdap.example.test/co.uk/'] },
    { suffix: 'de', type: 'country-code', rdapUrls: [], whoisServer: 'whois.denic.de' },
  ] };
  const catalog = new RegistryCatalog(snapshot);
  assert.equal(catalog.lookup('NAME.CO.UK.')?.suffix, 'co.uk');
  assert.equal(catalog.lookup('.uk')?.suffix, 'uk');
  assert.equal(catalog.lookup('https://example.co.uk'), undefined);
  assert.equal(catalog.lookup('example.unknown'), undefined);
  assert.deepEqual(catalog.lookup('example.de')?.rdapUrls, ['https://rdap.denic.de/']);
  const escaped = catalog.entries();
  escaped[0].rdapUrls.length = 0;
  assert.equal(catalog.lookup('name.uk')?.rdapUrls.length, 1);

  let calls = 0;
  let status = 503;
  let body: unknown = {};
  const context: ProviderContext = {
    env: {}, now: Date.now, whois: async () => { throw new Error('Unexpected WHOIS'); },
    request: async url => {
      assert.equal(url, IANA_REGISTRY_URL);
      calls++;
      return { status, body, text: JSON.stringify(body), headers: new Headers() };
    },
  };
  const [one, two] = await Promise.all([catalog.refresh(context), catalog.refresh(context)]);
  assert.equal(calls, 1);
  assert.equal(one.refreshed, false);
  assert.equal(two.outcome, 'retained');
  assert.equal(one.reason, 'http_503');
  assert.equal(catalog.lookup('name.co.uk')?.suffix, 'co.uk');

  status = 200;
  body = { meta: { generated: '2026-10-24T00:00:00Z' }, domains: [
    { name: 'com', status: 'active', type: 'generic', rdap_base_urls: ['https://rdap.example.test/com'], whois_server: 'whois.example.test', contacts: { private: 'discard' } },
    { name: 'retired', status: 'retired', type: 'generic', rdap_base_urls: [], whois_server: null },
  ] };
  const updated = await catalog.refresh(context);
  assert.equal(updated.refreshed, true);
  assert.equal(updated.activeTlds, 1);
  assert.equal(updated.routedTlds, 1);
  assert.equal(catalog.lookup('name.co.uk'), undefined);
  assert.deepEqual(catalog.lookup('name.com'), {
    suffix: 'com', type: 'generic', rdapUrls: ['https://rdap.example.test/com/'], whoisServer: 'whois.example.test',
  });
  assert.equal(JSON.stringify(catalog.entries()).includes('discard'), false);
  body = { meta: { generated: 'invalid' }, domains: [] };
  const retained = await catalog.refresh(context);
  assert.equal(retained.reason, 'invalid_registry_data');
  assert.equal(retained.activeTlds, 1);
  assert.ok(catalog.lookup('name.com'));

  const bundled = new RegistryCatalog();
  const count = bundled.summary();
  assert.ok(count.activeTlds > 1000);
  assert.equal(count.routedTlds + count.unroutedTlds, count.activeTlds);
  assert.equal(bundled.lookup('name.dk')?.whoisServer, 'whois.punktum.dk');
  assert.ok(bundled.lookup('name.ch')?.rdapUrls.includes('https://rdap.nic.ch/'));
});
