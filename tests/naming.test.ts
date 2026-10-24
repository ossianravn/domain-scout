import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareDomainSearch } from '../src/naming.js';
import { generateShortDomains } from '../src/shortnames.js';

test('a naming journey asks for useful preferences and reuses a complete brief', () => {
  const first = prepareDomainSearch({ project: 'A second brain project' });
  assert.equal(first.nextAction, 'ask_preferences');
  const style = first.questions.find(question => question.field === 'namingStyles')!;
  assert.match(style.prompt, /untested availability/);
  for (const kind of ['Descriptive', 'Suggestive', 'Metaphorical', 'Playful', 'Invented', 'Domain phrase']) {
    assert.ok(style.choices!.some(choice => choice.startsWith(kind)));
  }
  assert.ok(style.choices!.some(choice => /mixed first pass/.test(choice)));
  assert.ok(first.directions.some(direction => direction.theme === 'Rediscovery'));
  assert.equal(first.shortSearch, undefined);

  const complete = prepareDomainSearch({
    project: 'A teaching app for teachers to prepare lessons',
    audience: 'Danish secondary-school teachers', language: 'da',
    namingStyles: ['suggestive', 'metaphorical'], tlds: ['.DK'], tldPreference: 'required',
    budget: { purchase: 200, renewal: 150, currency: 'DKK' }, priority: 'brand',
    favorites: ['Udsyn'], rejected: ['LessonRobot'],
  });
  assert.equal(complete.nextAction, 'generate_candidates');
  assert.deepEqual(complete.questions, []);
  assert.deepEqual(complete.proposedDefaults, []);
  assert.deepEqual(complete.brief.tlds, ['dk']);
  assert.deepEqual(complete.feedback, { favorites: ['Udsyn'], rejected: ['LessonRobot'] });
  assert.equal(complete.brief.budget!.renewal, 150);
  assert.equal(complete.brief.allowAftermarket, undefined);

  const ambiguous = prepareDomainSearch({ project: 'A teaching app', namingStyles: ['mixed'] });
  assert.ok(ambiguous.questions.some(question => question.field === 'audience' && question.importance === 'primary'));
});

test('Danish AI news and short-domain requests retain their own language and search scope', () => {
  const news = prepareDomainSearch({
    project: 'Et dansk nyhedssite om kunstig intelligens', language: 'da',
    namingStyles: ['descriptive', 'metaphorical'], tlds: ['dk'],
  });
  assert.equal(news.useCase, 'ai_news');
  assert.equal(news.brief.language, 'da');
  assert.ok(news.directions.some(direction => direction.roots.includes('udsyn')));
  assert.ok(news.directions.some(direction => direction.roots.includes('dagens')));
  assert.ok(!news.questions.some(question => ['language', 'namingStyles', 'tlds'].includes(question.field)));
  assert.equal(news.brief.budget, undefined);

  const short = prepareDomainSearch({
    project: 'A short URL service', namingStyles: ['mixed'],
    language: 'en', allowPremium: false, allowAftermarket: false,
    shortSearch: { patterns: ['CV'], tlds: ['to'], pageSize: 2 },
  });
  assert.equal(short.brief.priority, 'shortest');
  assert.equal(short.shortSearch!.status, 'unverified');
  assert.equal(short.shortSearch!.candidates.length, 2);
  assert.ok(!short.questions.some(question => ['tlds', 'acquisition'].includes(question.field)));
  assert.throws(() => prepareDomainSearch({
    project: 'A shortener', tlds: ['dk'], tldPreference: 'required',
    shortSearch: { patterns: ['CV'], tlds: ['to'] },
  }), /explicitly required tlds/);
});

test('pattern discovery orders complete hostnames and removes overlapping patterns', () => {
  const page = generateShortDomains({ patterns: ['VV', 'V'], tlds: ['co.uk', 'com', 'to'], pageSize: 1000 });
  assert.equal(page.status, 'unverified');
  assert.equal(page.exhausted, true);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(page.candidates[0], { domain: 'a.to', hostnameLength: 4, labelLength: 1 });
  assert.ok(page.candidates.find(candidate => candidate.domain === 'a.co.uk')!.hostnameLength === 7);
  for (let index = 1; index < page.candidates.length; index++) {
    assert.ok(page.candidates[index - 1].hostnameLength <= page.candidates[index].hostnameLength);
  }
  assert.ok(page.candidates.findIndex(candidate => candidate.domain === 'aa.to') <
    page.candidates.findIndex(candidate => candidate.domain === 'a.co.uk'));

  const overlap = generateShortDomains({ patterns: ['CV', 'VC', 'll', 'LL'], tlds: ['to', '.TO.'], pageSize: 1000 });
  assert.equal(overlap.scope.totalPatternSpace, '676');
  assert.equal(overlap.candidates.length, 676);
  assert.equal(new Set(overlap.candidates.map(candidate => candidate.domain)).size, 676);
});

test('continuation changes page size without gaps and keeps exclusions consistent', () => {
  const scope = { patterns: ['C', 'V', 'L'], tlds: ['to'], exclude: ['A.TO.', 'e.to'] };
  const first = generateShortDomains({ ...scope, pageSize: 7 });
  const second = generateShortDomains({ ...scope, pageSize: 5, cursor: first.nextCursor! });
  const third = generateShortDomains({ ...scope, pageSize: 100, cursor: second.nextCursor! });
  const combined = [...first.candidates, ...second.candidates, ...third.candidates];
  const whole = generateShortDomains({ ...scope, pageSize: 100 });
  assert.deepEqual(combined, whole.candidates);
  assert.equal(combined.length, 24);
  assert.equal(third.exhausted, true);
  assert.ok(combined.every(candidate => !['a.to', 'e.to'].includes(candidate.domain)));
  assert.throws(() => generateShortDomains({ ...scope, tlds: ['com'], cursor: first.nextCursor! }), /different patterns, suffixes, or exclusions/);
  assert.throws(() => generateShortDomains({ ...scope, exclude: [], cursor: first.nextCursor! }), /different patterns, suffixes, or exclusions/);
});

test('a saved cursor can resume near the end of a huge finite space', { timeout: 2000 }, () => {
  const scope = { patterns: ['L'.repeat(20)], tlds: ['com'], pageSize: 2 };
  const first = generateShortDomains(scope);
  assert.equal(first.scope.totalPatternSpace, (26n ** 20n).toString());
  // Model a persisted checkpoint near the end; reaching it must not replay
  // the preceding trillions of candidates.
  const checkpoint = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString('utf8'));
  checkpoint.offset = (26n ** 20n - 2n).toString();
  const cursor = Buffer.from(JSON.stringify(checkpoint)).toString('base64url');
  const resumed = generateShortDomains({ ...scope, cursor });
  assert.deepEqual(resumed.candidates.map(candidate => candidate.domain), [
    `${'z'.repeat(19)}y.com`, `${'z'.repeat(20)}.com`,
  ]);
  assert.equal(resumed.exhausted, true);
});

test('DNS normalization handles suffixes and IDNs while rejecting URL fragments and malformed labels', () => {
  const normalized = generateShortDomains({ patterns: ['v'], tlds: ['.COM.', 'рф', 'some-tld'], pageSize: 100 });
  assert.deepEqual(normalized.scope.tlds, ['com', 'some-tld', 'xn--p1ai']);
  assert.ok(normalized.candidates.some(candidate => candidate.domain === 'a.xn--p1ai'));
  assert.ok(normalized.candidates.every(candidate => candidate.hostnameLength === candidate.domain.length));
  for (const suffix of ['-bad', 'bad-', 'co..uk', 'foo_bar', 'com/path', 'com?x', 'com#x', 'foo%2ebar']) {
    assert.throws(() => generateShortDomains({ patterns: ['CV'], tlds: [suffix] }), /DNS name/);
    assert.throws(() => prepareDomainSearch({ project: 'A site', tlds: [suffix] }), /DNS name/);
  }
  assert.throws(() => generateShortDomains({ patterns: ['C-V'], tlds: ['com'] }));
  assert.throws(() => generateShortDomains({ patterns: ['C'.repeat(64)], tlds: ['com'] }));
  assert.throws(() => generateShortDomains({ patterns: ['CV'], tlds: ['com'], exclude: ['ba.com/path'] }), /DNS name/);
});
