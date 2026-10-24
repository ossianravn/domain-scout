import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { DomainEngine } from './engine.js';
import { checkDomainsSchema, createToolHandlers, domainSourcesSchema, prepareDomainSearchSchema } from './tools.js';

export const instructions = `Help the user find attractive domains for their project.
For a naming request, call prepare_domain_search with preferences already known.
Resolve material missing naming preferences with a concise question and illustrated choices.
Use the host model to create diverse, meaningful candidates in the requested language.
Then call check_domains with batches of exact domains. An explicit request to check names can go directly to check_domains.
Use domain_sources when extension coverage matters. Published routes do not guarantee registrability or current service health.
For shortest-domain searches, use shortSearch patterns and pages from prepare_domain_search.
Compare complete hostname length, pronunciation, spelling, price, and the user's stated priorities.
Only status available establishes that the named source reports registrability at checkedAt.
Do not turn not_found, unknown, unsupported, or a DNS failure into available.
Preserve quoted currency and periods; do not assume an unspecified renewal period is annual.
Show sources, timestamps, and reasons with the shortlist. Recheck finalists with fresh=true.
Report shortest found within the explored scope, unless the agreed smaller search space was exhausted.
The tools search names; they do not buy, reserve, or register them.`;

function toolResult(value: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: { ...value },
  };
}

export function createMcpServer(engine = new DomainEngine()) {
  const handlers = createToolHandlers(engine);
  const server = new McpServer({ name: 'domain-scout', version: '0.2.0' }, { instructions });
  server.registerTool('domain_sources', {
    title: 'Inspect domain lookup sources',
    description: 'Show the local registry catalog, published RDAP/WHOIS routes for requested extensions, and configured availability sources. No network by default; refresh=true explicitly updates IANA routing metadata.',
    inputSchema: domainSourcesSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => toolResult(await handlers.domain_sources(input)));
  server.registerTool('prepare_domain_search', {
    title: 'Prepare a creative domain search',
    description: 'Build a naming brief, illustrate missing preferences, suggest semantic directions, and optionally generate paginated short-domain candidates. Performs no network lookup. The host agent supplies creative judgment.',
    inputSchema: prepareDomainSearchSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, input => toolResult(handlers.prepare_domain_search(input)));
  server.registerTool('check_domains', {
    title: 'Check domain availability',
    description: 'Check exact registrable domains in batches. Routes by supported suffix, coalesces repeated checks, and preserves availability evidence, uncertainty, provider timestamps, and any prices. No registration or purchase occurs.',
    inputSchema: checkDomainsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => toolResult(await handlers.check_domains(input)));
  server.registerPrompt('find_domains', {
    title: 'Find a domain for a project',
    description: 'Start a creative domain search with preference checks and live availability evidence.',
    argsSchema: z.object({ project: z.string().min(1).describe('The project or domain-search request') }),
  }, ({ project }) => ({
    messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `${instructions}\n\nMy request:\n${project}` } }],
  }));
  return server;
}
