import { randomBytes } from 'node:crypto';
import { DomainEngine } from '../src/engine.js';

const engine = new DomainEngine();
const token = randomBytes(5).toString('hex');
const domains = ['example.com', ...Array.from({ length: 19 }, (_, index) =>
  `domain-scout-${token}-${index}.com`)];
const first = await engine.check(domains, true);
const repeated = await engine.check(domains);
const regional = await engine.check(['punktum.dk', 'isnic.is', 'iis.se']);
const simplify = (output: typeof first) => ({
  summary: output.summary,
  results: output.results.map(({ domain, status, source, checkedAt, reason, pricing, attempts }) => ({
    domain, status, source, checkedAt, reason, pricing, attempts,
  })),
});
process.stdout.write(`${JSON.stringify({
  checkedAt: new Date().toISOString(),
  batch: simplify(first), repeated: { summary: repeated.summary }, regional: simplify(regional),
}, null, 2)}\n`);
