import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapUrl, fixture, rdapBase, registrar, response } from './fixtures.js';

test('routes supported registrar extensions and distinguishes DK waiting lists from missing records', async () => {
  const f = fixture({
    catalog: ['com'],
    http: url => url === `${registrar}/domains/search` ? response(200, { results: [
      { domain: 'taken.com', available: false },
      { domain: 'ready.com', available: true, price: 18, years: 2, renewalPrice: 12, premium: false },
    ] }) : undefined,
    whois: (_host, query) => query.endsWith('waiting.dk')
      ? '# Punktum dk\nDomain: waiting.dk\nRegistered: *** N/A ***\nStatus: Offered to waiting list\n'
      : query.endsWith('missing.dk') ? '# Punktum dk\nNo entries found for the selected source.\n' : undefined,
  });

  const output = await f.engine.check(['TAKEN.COM.', 'ready.com', 'waiting.dk', 'missing.dk']);
  assert.deepEqual(output.results.map(item => [item.domain, item.status, item.source]), [
    ['taken.com', 'unavailable', 'vercel'], ['ready.com', 'available', 'vercel'],
    ['waiting.dk', 'unavailable', 'punktum-whois'], ['missing.dk', 'not_found', 'punktum-whois'],
  ]);
  assert.equal(output.results[2]?.reason, 'waiting_list_offer');
  assert.deepEqual(output.results[1]?.pricing, {
    currency: 'USD', registration: 18, registrationYears: 2,
    renewal: 12, renewalYears: null, premium: false,
  });
  assert.equal(f.searches().length, 1);
  assert.deepEqual(JSON.parse(String(f.searches()[0]?.init?.body)), { domains: ['taken.com', 'ready.com'] });
  assert.deepEqual(f.whoisRequests, [
    { host: 'whois.punktum.dk', query: ' --charset=utf8 waiting.dk' },
    { host: 'whois.punktum.dk', query: ' --charset=utf8 missing.dk' },
  ]);
  assert.equal(f.requests.filter(item => item.url.endsWith('/tlds/supported')).length, 1);
  assert.deepEqual(f.unexpected, []);
});

test('ISNIC requires explicit DAC availability and never treats an HTML 404 as a free domain', async () => {
  const f = fixture({ http: url => {
    if (url.endsWith('/dac/ready.is')) return response(404, { errorCode: 404, description: ['Available'] });
    if (url.endsWith('/dac/broken.is')) return response(404, '<html>Not found</html>', { 'Content-Type': 'text/html' });
    if (url.endsWith('/dac/occupied.is')) return response(200, { objectClassName: 'domain', ldhName: 'occupied.is' });
    return undefined;
  } });
  const output = await f.engine.check(['ready.is', 'broken.is', 'occupied.is']);
  assert.deepEqual(output.results.map(item => [item.status, item.source]), [
    ['available', 'isnic'], ['unknown', 'isnic'], ['unavailable', 'isnic'],
  ]);
  assert.equal(output.results[1]?.reason, 'invalid_response');
  assert.equal(f.searches().length, 0);
  assert.equal(f.requests.filter(item => item.url === bootstrapUrl).length, 0);
  assert.deepEqual(f.unexpected, []);
});

test('RDAP validates matching records and structured negatives and uses the longest catalog suffix', async () => {
  const preciseBase = 'https://rdap.precise.test/';
  const f = fixture({
    services: [[['org', 'uk'], [rdapBase]], [['co.uk'], [preciseBase]]],
    http: url => {
      if (url === `${rdapBase}domain/missing.org`) return response(404, { errorCode: 404, title: 'Not Found' });
      if (url === `${rdapBase}domain/broken.org`) return response(404, '<html>Not found</html>');
      if (url === `${rdapBase}domain/known.org`) return response(200, { objectClassName: 'domain', ldhName: 'KNOWN.ORG' });
      if (url === `${rdapBase}domain/mismatch.org`) return response(200, { objectClassName: 'domain', ldhName: 'other.org' });
      if (url === `${preciseBase}domain/precise.co.uk`) return response(200, { objectClassName: 'domain', ldhName: 'precise.co.uk' });
      return undefined;
    },
  });
  const output = await f.engine.check(['missing.org', 'broken.org', 'known.org', 'mismatch.org', 'precise.co.uk']);
  assert.deepEqual(output.results.map(item => [item.status, item.source]), [
    ['not_found', 'rdap'], ['unknown', 'rdap'], ['registered', 'rdap'],
    ['unknown', 'rdap'], ['registered', 'rdap'],
  ]);
  assert.equal(output.results[1]?.reason, 'invalid_response');
  assert.equal(output.results[3]?.reason, 'invalid_response');
  assert.match(output.results[0]?.evidence ?? '', /Registrability and pricing remain unverified/);
  assert.match(output.results[4]?.evidence ?? '', /rdap\.precise\.test/);
  assert.equal(f.requests.filter(item => item.url === bootstrapUrl).length, 0);
  assert.equal(f.searches().length, 0);
  assert.deepEqual(f.unexpected, []);
});

test('rate limits fall back to RDAP, preserve Retry-After when unresolved, and suppress immediate retries', async () => {
  const f = fixture({
    catalog: ['com', 'io'],
    http: url => {
      if (url === `${registrar}/domains/search`) return response(429, { error: 'Rate limited' }, { 'Retry-After': '120' });
      if (url === `${rdapBase}domain/limited.com`) return response(200, { objectClassName: 'domain', ldhName: 'limited.com' });
      return undefined;
    },
  });
  const first = await f.engine.check(['limited.com', 'limited.io']);
  assert.equal(first.results[0]?.status, 'registered');
  assert.equal(first.results[0]?.source, 'rdap');
  assert.deepEqual(first.results[0]?.attempts, [{ source: 'vercel', status: 'unknown', reason: 'rate_limited' }]);
  assert.equal(first.results[1]?.status, 'unknown');
  assert.equal(first.results[1]?.source, 'vercel');
  assert.equal(first.results[1]?.retryAfterMs, 120_000);

  const fresh = await f.engine.check(['limited.com', 'limited.io'], true);
  assert.equal(fresh.results[0]?.status, 'registered');
  assert.equal(fresh.results[0]?.source, 'rdap');
  assert.equal(fresh.results[1]?.status, 'unknown');
  assert.equal(fresh.results[1]?.source, 'vercel');
  assert.ok((fresh.results[1]?.retryAfterMs ?? 0) > 0);
  assert.ok((fresh.results[1]?.retryAfterMs ?? Infinity) <= 120_000);
  assert.equal(f.searches().length, 1);
  assert.equal(f.requests.filter(item => item.url === `${rdapBase}domain/limited.com`).length, 2);
  assert.deepEqual(f.unexpected, []);
});

test('canonicalizes, deduplicates concurrent work, caches evidence, and refreshes on request or expiry', async () => {
  let available = true;
  const f = fixture({ http: (url, init) => {
    if (url !== `${registrar}/domains/search`) return undefined;
    const { domains } = JSON.parse(String(init?.body)) as { domains: string[] };
    return response(200, { results: domains.map(domain => ({ domain, available, price: 10, years: 1 })) });
  } });
  const [first, overlapping] = await Promise.all([
    f.engine.check([' EXAMPLE.COM. ', 'example.com', 'BØGER.COM.', 'xn--bger-gra.com']),
    f.engine.check(['Example.Com']),
  ]);
  assert.equal(first.summary.inputCount, 4);
  assert.equal(first.summary.uniqueDomains, 2);
  assert.deepEqual(first.results.map(item => item.domain), ['example.com', 'example.com', 'xn--bger-gra.com', 'xn--bger-gra.com']);
  assert.ok([...first.results, ...overlapping.results].every(item => item.status === 'available' && item.cached === false));
  assert.equal(f.searches().length, 1);
  assert.deepEqual(JSON.parse(String(f.searches()[0]?.init?.body)), { domains: ['example.com', 'xn--bger-gra.com'] });

  available = false;
  const cached = await f.engine.check(['example.com', 'bøger.com']);
  assert.equal(cached.summary.cacheHits, 2);
  assert.ok(cached.results.every(item => item.status === 'available' && item.cached === true));
  assert.equal(f.searches().length, 1);

  const fresh = await f.engine.check(['EXAMPLE.COM.', 'bøger.com'], true);
  assert.equal(fresh.summary.cacheHits, 0);
  assert.ok(fresh.results.every(item => item.status === 'unavailable' && item.cached === false));
  assert.equal(f.searches().length, 2);
  f.advance(1001);
  await f.engine.check(['example.com']);
  assert.equal(f.searches().length, 3);
  assert.equal(f.requests.filter(item => item.url.endsWith('/tlds/supported')).length, 1);
  assert.deepEqual(f.unexpected, []);
});

test('a missing registrar row falls back without discarding successful results from the same batch', async () => {
  const f = fixture({ http: url => {
    if (url === `${registrar}/domains/search`) return response(200, { results: [{ domain: 'good.com', available: true }] });
    if (url === `${rdapBase}domain/omitted.com`) return response(404, { errorCode: 404 });
    return undefined;
  } });
  const output = await f.engine.check(['good.com', 'omitted.com']);
  assert.equal(output.results[0]?.status, 'available');
  assert.equal(output.results[0]?.source, 'vercel');
  assert.deepEqual(output.results[0]?.pricing, {
    currency: 'USD', registration: null, registrationYears: null,
    renewal: null, renewalYears: null, premium: null,
  });
  assert.equal(output.results[1]?.status, 'not_found');
  assert.equal(output.results[1]?.source, 'rdap');
  assert.deepEqual(output.results[1]?.attempts, [{ source: 'vercel', status: 'unknown', reason: 'invalid_response' }]);
  assert.deepEqual(f.unexpected, []);
});

test('Simply uses configured bearer credentials, requires registrability, and falls back to DK WHOIS', async () => {
  const origin = 'https://api.simply.com/2/my/domaincheck/';
  const combinations: Record<string, [boolean, boolean]> = {
    'ready.dk': [true, true], 'restricted.dk': [true, false],
    'taken.dk': [false, false], 'contradictory.dk': [false, true],
  };
  const f = fixture({
    env: { SIMPLY_API_KEY: ' fixture-key ' },
    http: url => {
      if (url === `${origin}failure.dk/`) return response(503, { error: 'Unavailable' });
      const name = Object.keys(combinations).find(domain => url === `${origin}${domain}/`);
      if (!name) return undefined;
      const [available, canregister] = combinations[name]!;
      return response(200, { status: 200, domain: { name, available, canregister } });
    },
    whois: (_host, query) => query.endsWith('contradictory.dk')
      ? 'No entries found for the selected source.\n'
      : query.endsWith('failure.dk') ? 'Domain: failure.dk\nRegistered: 2020-01-01\nStatus: Active\n' : undefined,
  });
  const output = await f.engine.check([...Object.keys(combinations), 'failure.dk']);
  assert.deepEqual(output.results.map(item => [item.domain, item.status, item.source]), [
    ['ready.dk', 'available', 'simply'], ['restricted.dk', 'unavailable', 'simply'],
    ['taken.dk', 'unavailable', 'simply'], ['contradictory.dk', 'not_found', 'punktum-whois'],
    ['failure.dk', 'registered', 'punktum-whois'],
  ]);
  assert.equal(output.results[1]?.reason, 'registration_restricted');
  assert.equal(output.results[2]?.reason, 'provider_reports_unavailable');
  assert.deepEqual(output.results[3]?.attempts, [{ source: 'simply', status: 'unknown', reason: 'invalid_response' }]);
  assert.deepEqual(output.results[4]?.attempts, [{ source: 'simply', status: 'unknown', reason: 'http_503' }]);
  assert.equal(f.requests.length, 5);
  assert.ok(f.requests.every(item => new Headers(item.init?.headers).get('Authorization') === 'Bearer fixture-key'));
  assert.equal(f.whoisRequests.length, 2);
  assert.equal(JSON.stringify(output).includes('fixture-key'), false);
  assert.deepEqual(f.unexpected, []);
});

test('IIS distinguishes free from occupied and rejects mismatched domains and HTML responses', async () => {
  const responses: Record<string, string> = {
    'http://free.iis.se/free?q=ready.se': 'free ready.se\n',
    'http://free.iis.nu/free?q=taken.nu': 'occupied taken.nu\n',
    'http://free.iis.se/free?q=mismatch.se': 'free other.se\n',
    'http://free.iis.nu/free?q=broken.nu': '<html>free broken.nu</html>',
  };
  const f = fixture({ http: url => responses[url] === undefined ? undefined : response(200, responses[url]) });
  const output = await f.engine.check(['ready.se', 'taken.nu', 'mismatch.se', 'broken.nu']);
  assert.deepEqual(output.results.map(item => [item.status, item.source]), [
    ['available', 'internetstiftelsen'], ['registered', 'internetstiftelsen'],
    ['unknown', 'internetstiftelsen'], ['unknown', 'internetstiftelsen'],
  ]);
  assert.ok(output.results.slice(2).every(item => item.reason === 'invalid_response'));
  assert.match(output.results[0]?.evidence ?? '', /HTTP transport/);
  assert.equal(f.requests.filter(item => item.url.startsWith('http://free.iis.')).length, 4);
  assert.equal(f.searches().length, 0);
  assert.deepEqual(f.unexpected, []);
});
