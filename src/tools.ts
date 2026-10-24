import { z } from 'zod/v4';
import { MAX_TIMER_MS } from './config.js';
import { DomainEngine } from './engine.js';
import { prepareDomainSearch, prepareDomainSearchSchema } from './naming.js';

export { prepareDomainSearchSchema };
export const domainSourcesSchema = z.object({
  tlds: z.array(z.string().min(1)).default([])
    .describe('Optional extensions such as dk, com, co.uk or an internationalized suffix.'),
  refresh: z.boolean().default(false)
    .describe('Explicitly refresh IANA routing data. The default uses the bundled catalog immediately with no network request.'),
});
export const checkDomainsSchema = z.object({
  domains: z.array(z.string().min(1)).min(1)
    .describe('Exact registrable domains, including their suffix. Batch candidates in one call.'),
  screen: z.boolean().default(true)
    .describe('Use DNS to rule out names that are clearly in use before slow registry lookups. Set false to ask the registry about a likely_taken name.'),
  fresh: z.boolean().default(false)
    .describe('Bypass cached evidence when verifying finalists; in-progress checks may still be shared.'),
  maxWaitMs: z.number().int().positive().max(MAX_TIMER_MS).optional()
    .describe('Whole-call wait budget in milliseconds; default 10000 (or DOMAIN_SCOUT_MAX_WAIT_MS). Return completed results and mark unresolved checks unknown. Increase for slow sources.'),
});

export function createToolHandlers(engine = new DomainEngine()) {
  return {
    domain_sources: (input: unknown) => {
      const { tlds, refresh } = domainSourcesSchema.parse(input);
      return engine.sources(tlds, refresh);
    },
    prepare_domain_search: (input: unknown) => prepareDomainSearch(prepareDomainSearchSchema.parse(input)),
    check_domains: (input: unknown) => {
      const { domains, fresh, maxWaitMs, screen } = checkDomainsSchema.parse(input);
      return engine.check(domains, fresh, maxWaitMs, screen);
    },
  };
}
