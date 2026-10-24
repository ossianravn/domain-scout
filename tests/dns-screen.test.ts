import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, registrar, response } from './fixtures.js';

const resolver = 'https://dns.fixture.test/resolve';
const env = { DOMAIN_SCOUT_DNS_RESOLVERS: resolver };
const registered = (domain: string) => `# Punktum dk\nDomain: ${domain}\nRegistered: 2020-01-01\nStatus: Active\n`;

function dnsReply(domain: string, delegated: boolean) {
  return response(200, {
    Status: delegated ? 0 : 3, TC: false,
    Question: [{ name: delegated ? domain.toUpperCase() : `${domain}.`, type: 2 }],
    Answer: delegated ? [{ name: `${domain.toUpperCase()}.`, type: 2, data: 'NS1.EXAMPLE.NET.' }] : [],
  });
}

test('DNS screens paced names, preserves registry fallbacks, and separates unscreened checks', async () => {
  const f = fixture({
    env,
    http: url => {
      if (url.startsWith(`${resolver}?`)) {
        const domain = new URL(url).searchParams.get('name')!;
        return dnsReply(domain, ['delegated.dk', 'overlap.dk'].includes(domain));
      }
      if (url === `${registrar}/domains/search`) {
        return response(200, { results: [{ domain: 'ready.com', available: true }] });
      }
      return undefined;
    },
    whois: (host, query) => {
      if (host !== 'whois.punktum.dk') return undefined;
      if (query === ' --charset=utf8 missing.dk') return '# Punktum dk\nNo entries found for the selected source.\n';
      const domain = ['delegated.dk', 'overlap.dk'].find(name => query === ` --charset=utf8 ${name}`);
      return domain ? registered(domain) : undefined;
    },
  });
  const dnsRequests = () => f.requests.filter(({ url }) => url.startsWith(`${resolver}?`));
  const output = await f.engine.check(['delegated.dk', 'missing.dk', 'ready.com']);
  assert.deepEqual(output.results.map(item => [item.domain, item.status, item.source]), [
    ['delegated.dk', 'likely_taken', 'dns'],
    ['missing.dk', 'not_found', 'punktum-whois'],
    ['ready.com', 'available', 'vercel'],
  ]);
  assert.equal(output.results[0]?.reason, 'dns_delegated');
  assert.equal(output.results[0]?.registry, 'dns.fixture.test');
  assert.equal(output.results[0]?.evidence,
    'DNS lists nameservers for delegated.dk (ns1.example.net), so it is almost certainly registered. The registry was not asked.');
  assert.deepEqual(f.whoisRequests, [{ host: 'whois.punktum.dk', query: ' --charset=utf8 missing.dk' }]);
  assert.ok(output.results[1]?.attempts?.some(attempt => attempt.source === 'dns' && attempt.reason === 'dns_no_delegation'));
  assert.equal(dnsRequests().length, 3);
  assert.ok(dnsRequests().every(({ url, init }) => new URL(url).searchParams.get('name')?.endsWith('.dk')
    && new URL(url).searchParams.get('type') === 'NS'
    && new Headers(init?.headers).get('accept') === 'application/dns-json'
    && init?.signal instanceof AbortSignal));
  assert.equal(dnsRequests().filter(({ url }) => /^ds[0-9a-f]{12}\.dk$/.test(new URL(url).searchParams.get('name')!)).length, 1);

  const cached = await f.engine.check(['delegated.dk']);
  assert.equal(cached.results[0]?.status, 'likely_taken');
  assert.equal(cached.summary.cacheHits, 1);
  const confirmed = await f.engine.check(['delegated.dk'], false, undefined, false);
  assert.equal(confirmed.results[0]?.status, 'registered');
  assert.equal(confirmed.results[0]?.source, 'punktum-whois');
  assert.equal(confirmed.summary.cacheHits, 0);
  assert.equal(dnsRequests().length, 3);
  assert.ok(f.whoisRequests.some(({ query }) => query === ' --charset=utf8 delegated.dk'));

  const [screened, unscreened] = await Promise.all([
    f.engine.check(['overlap.dk']),
    f.engine.check(['overlap.dk'], false, undefined, false),
  ]);
  assert.equal(screened.results[0]?.status, 'likely_taken');
  assert.equal(unscreened.results[0]?.source, 'punktum-whois');
  assert.equal(unscreened.results[0]?.status, 'registered');
  assert.ok(f.whoisRequests.some(({ query }) => query === ' --charset=utf8 overlap.dk'));
  assert.equal(dnsRequests().length, 4, 'the conclusive sibling probe is reused for the suffix');
  assert.deepEqual(f.unexpected, []);
});

test('wildcard delegation falls through to Punktum instead of claiming likely_taken', async () => {
  const f = fixture({
    env,
    http: url => url.startsWith(`${resolver}?`)
      ? dnsReply(new URL(url).searchParams.get('name')!, true) : undefined,
    whois: (host, query) => host === 'whois.punktum.dk' && query === ' --charset=utf8 wildcard.dk'
      ? registered('wildcard.dk') : undefined,
  });
  const output = await f.engine.check(['wildcard.dk']);
  assert.equal(output.results[0]?.source, 'punktum-whois');
  assert.equal(output.results[0]?.status, 'registered');
  assert.ok(output.results[0]?.attempts?.some(attempt => attempt.source === 'dns' && attempt.reason === 'dns_inconclusive'));
  assert.deepEqual(f.whoisRequests, [{ host: 'whois.punktum.dk', query: ' --charset=utf8 wildcard.dk' }]);
  const queries = f.requests.map(({ url }) => new URL(url).searchParams.get('name'));
  assert.equal(queries.length, 2);
  assert.equal(queries[0], 'wildcard.dk');
  assert.match(queries[1]!, /^ds[0-9a-f]{12}\.dk$/);
  assert.deepEqual(f.unexpected, []);
});
