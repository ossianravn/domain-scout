import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { MAX_TIMER_MS, readSettings } from '../src/config.js';
import { DomainEngine } from '../src/engine.js';
import { checkDomainsSchema } from '../src/tools.js';
import { result, type DomainProvider, type ProviderContext } from '../src/types.js';

function gate() {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { pending, release };
}

function context(now: () => number = Date.now): ProviderContext {
  return {
    env: {}, now,
    request: async () => { throw new Error('Unexpected HTTP request'); },
    whois: async () => { throw new Error('Unexpected WHOIS request'); },
  };
}

function provider(id: string, overrides: Partial<DomainProvider> = {}): DomainProvider {
  return {
    id, batchSize: 200, minIntervalMs: 0, concurrency: 1,
    supports: async () => true,
    check: async names => names.map(name => result(name, id, 'available', 'Fixture evidence')),
    ...overrides,
  };
}

test('budget returns completed names through nested fallback and active results can later enter cache', { timeout: 2000 }, async t => {
  const hold = gate();
  t.after(() => hold.release());
  const batches: string[][] = [];
  const primary = provider('primary', {
    check: async names => {
      batches.push(names.map(name => name.domain));
      return names.map(name => result(name, 'primary', name.domain === 'fast.com' ? 'available' : 'unknown', 'Fixture'));
    },
  });
  const second = provider('second', {
    check: async names => names.map(name => result(name, 'second', name.domain === 'middle.com' ? 'available' : 'unknown', 'Fixture')),
  });
  let slowStarted = false;
  const slow = provider('slow', {
    check: async names => {
      slowStarted = true;
      await hold.pending;
      return names.map(name => result(name, 'slow', 'available', 'Fixture'));
    },
  });
  const engine = new DomainEngine({ context: context(), providers: [primary, second, slow] });
  const output = await engine.check(['fast.com', 'middle.com', 'slow.com'], false, 60);
  assert.equal(slowStarted, true);
  assert.deepEqual(output.results.map(item => [item.domain, item.status]), [
    ['fast.com', 'available'], ['middle.com', 'available'], ['slow.com', 'unknown'],
  ]);
  assert.equal(output.results[2].reason, 'time_budget_exhausted');
  assert.equal(output.summary.deferred, 1);
  assert.deepEqual(batches, [['fast.com', 'middle.com', 'slow.com']]);
  hold.release();
  const completed = await engine.check(['slow.com'], false, 200);
  assert.equal(completed.results[0].status, 'available');
  assert.equal(completed.results[0].source, 'slow');
  const cached = await engine.check(['slow.com']);
  assert.equal(cached.results[0].cached, true);
});

test('queued checks cannot start after budget expiry, while a later explicit retry can', { timeout: 2000 }, async t => {
  const hold = gate();
  t.after(() => hold.release());
  const starts: string[] = [];
  const limited = provider('serial', {
    batchSize: 1,
    check: async names => {
      starts.push(names[0].domain);
      await hold.pending;
      return names.map(name => result(name, 'serial', 'available', 'Fixture'));
    },
  });
  const engine = new DomainEngine({ context: context(), providers: [limited] });
  const output = await engine.check(['one.com', 'two.com', 'three.com'], false, 60);
  assert.equal(output.summary.deferred, 3);
  assert.deepEqual(starts, ['one.com']);
  hold.release();
  await engine.check(['one.com'], false, 200);
  await delay(0);
  assert.deepEqual(starts, ['one.com']);
  const retry = await engine.check(['two.com'], false, 200);
  assert.equal(retry.results[0].status, 'available');
  assert.deepEqual(starts, ['one.com', 'two.com']);
});

test('unrelated catalog discovery cannot hide ready results or start a fallback past deadline', { timeout: 2000 }, async t => {
  const hold = gate();
  t.after(() => hold.release());
  let fallbackCoverage = 0;
  const first = provider('first', {
    supports: async name => {
      if (name.domain === 'fast.com') return true;
      await hold.pending;
      return false;
    },
  });
  const fallback = provider('fallback', {
    supports: async () => { fallbackCoverage++; return true; },
  });
  const engine = new DomainEngine({ context: context(), providers: [first, fallback] });
  const output = await engine.check(['fast.com', 'slow.com'], false, 60);
  assert.equal(output.results[0].status, 'available');
  assert.equal(output.results[1].reason, 'time_budget_exhausted');
  hold.release();
  await delay(0);
  assert.equal(fallbackCoverage, 0);
});

test('provider spacing that cannot fit the budget produces deferred results without starting extra checks', async () => {
  const starts: string[] = [];
  const spaced = provider('spaced', {
    batchSize: 1, minIntervalMs: 1000,
    check: async names => {
      starts.push(names[0].domain);
      return names.map(name => result(name, 'spaced', 'available', 'Fixture'));
    },
  });
  const engine = new DomainEngine({ context: context(), providers: [spaced] });
  const output = await engine.check(['first.com', 'second.com'], false, 100);
  assert.deepEqual(starts, ['first.com']);
  assert.equal(output.results[0].status, 'available');
  assert.equal(output.results[1].reason, 'time_budget_exhausted');
});

test('uppercase provider results resolve canonical inflight keys and populate the canonical cache', { timeout: 1000 }, async () => {
  let calls = 0;
  const uppercase = provider('uppercase', {
    check: async names => {
      calls++;
      return names.map(name => ({ ...result(name, 'uppercase', 'registered', 'Fixture'), domain: name.domain.toUpperCase() }));
    },
  });
  const engine = new DomainEngine({ context: context(), providers: [uppercase] });
  const output = await engine.check(['EXAMPLE.COM', 'example.com']);
  assert.deepEqual(output.results.map(item => [item.domain, item.status]), [
    ['example.com', 'registered'], ['example.com', 'registered'],
  ]);
  assert.equal((await engine.check(['Example.Com'])).results[0].cached, true);
  assert.equal(calls, 1);
});

test('rate limiting without Retry-After opens a cooldown for queued and subsequent checks', async () => {
  let calls = 0;
  const limited = provider('limited', {
    batchSize: 1,
    check: async names => {
      calls++;
      return names.map(name => result(name, 'limited', 'unknown', 'HTTP 429', { reason: 'rate_limited' }));
    },
  });
  const engine = new DomainEngine({ context: context(), providers: [limited] });
  const output = await engine.check(['one.com', 'two.com', 'three.com']);
  assert.equal(calls, 1);
  assert.ok(output.results.every(item => item.status === 'unknown' && item.reason === 'rate_limited'));
  assert.ok((output.results[1].retryAfterMs ?? 0) > 0);
  const next = await engine.check(['four.com']);
  assert.equal(calls, 1);
  assert.equal(next.results[0].reason, 'rate_limited');
});

test('a new search removes expired cache entries for names it does not revisit', async () => {
  let clock = 1000;
  const engine = new DomainEngine({ context: context(() => clock), providers: [provider('cache')], cacheTtlMs: 10 });
  await engine.check(Array.from({ length: 40 }, (_, index) => 'old' + index + '.com'));
  const entries = (engine as unknown as { cache: Map<string, unknown> }).cache;
  assert.equal(entries.size, 40);
  clock += 11;
  await engine.check(['new.com']);
  assert.deepEqual([...entries.keys()], ['new.com']);
});

test('coverage failures remain in chronological attempt evidence across a successful fallback', async () => {
  const first = provider('first-catalog', { supports: async () => { throw new Error('private detail'); } });
  const second = provider('second', {
    check: async names => names.map(name => result(name, 'second', 'unknown', 'Fixture', { reason: 'request_failed' })),
  });
  const third = provider('third-catalog', { supports: async () => { throw new Error('another private detail'); } });
  const engine = new DomainEngine({ context: context(), providers: [first, second, third, provider('last')] });
  const output = await engine.check(['example.com']);
  assert.equal(output.results[0].status, 'available');
  assert.deepEqual(output.results[0].attempts, [
    { source: 'first-catalog', status: 'unknown', reason: 'coverage_lookup_failed' },
    { source: 'second', status: 'unknown', reason: 'request_failed' },
    { source: 'third-catalog', status: 'unknown', reason: 'coverage_lookup_failed' },
  ]);
  assert.ok(!JSON.stringify(output).includes('private detail'));

  // A later coverage failure must not replace a rate-limited result and its retry hint.
  const limited = provider('limited', {
    check: async names => names.map(name => result(name, 'limited', 'unknown', 'Fixture',
      { reason: 'rate_limited', retryAfterMs: 1000 })),
  });
  const stalled = new DomainEngine({ context: context(), providers: [limited, third] });
  const [row] = (await stalled.check(['example.com'])).results;
  assert.deepEqual([row.source, row.status, row.reason, row.retryAfterMs], ['limited', 'unknown', 'rate_limited', 1000]);
  assert.deepEqual(row.attempts, [{ source: 'third-catalog', status: 'unknown', reason: 'coverage_lookup_failed' }]);
});

test('timer-backed settings and tool budgets reject values above the Node timer limit', async () => {
  assert.equal(readSettings({}).maxWaitMs, 10000);
  for (const key of ['DOMAIN_SCOUT_TIMEOUT_MS', 'DOMAIN_SCOUT_MAX_WAIT_MS']) {
    assert.throws(() => readSettings({ [key]: '1.5' }), /integer/);
    assert.throws(() => readSettings({ [key]: String(MAX_TIMER_MS + 1) }), /at most/);
    assert.doesNotThrow(() => readSettings({ [key]: String(MAX_TIMER_MS) }));
  }
  assert.equal(readSettings({ DOMAIN_SCOUT_CACHE_TTL_MS: String(MAX_TIMER_MS + 1) }).cacheTtlMs, MAX_TIMER_MS + 1);
  assert.equal(checkDomainsSchema.safeParse({ domains: ['example.com'], maxWaitMs: MAX_TIMER_MS + 1 }).success, false);
  const engine = new DomainEngine({ context: context(), providers: [provider('fixture')] });
  await assert.rejects(() => engine.check(['example.com'], false, MAX_TIMER_MS + 1), /at most/);
});
