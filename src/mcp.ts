import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import { DomainEngine } from './engine.js';
import { checkDomainsSchema, createToolHandlers, domainSourcesSchema, prepareDomainSearchSchema } from './tools.js';

export const instructions = `Help the user find a name and domain they can actually register.
A list of exact domains: call check_domains directly.
A naming request: call prepare_domain_search with everything already known. If nextAction is ask_preferences, ask one short turn: the naming-style question with unchecked examples adapted to the project, plus at most one other question that changes the search. "A mix" is a valid answer.
Write names with the host model across several directions and constructions; no more than a quarter of a wave may share a root, prefix or suffix.
Screen before checking: drop names that are hard to spell when heard, read two ways, are long for what they carry, misfit the audience, or imitate a known brand.
Wave size follows source speed: 25-50 names per call for fast endings such as .com; the best 15-20 for .dk, .nl, .be and WHOIS-only endings, where DNS rules out names in use and the rest wait about a second each (maxWaitMs about 1200 per name). Use domain_sources when coverage is unclear.
After each check, move the next wave towards the constructions and endings that came back open. Do not recheck names, except finalists with fresh=true.
Present a recommendation, then three to seven names with why each fits, status, source and check time, and price with currency and period.
Only status available means the named source reports the name registrable at checkedAt. likely_taken means DNS lists nameservers for the name; treat it as taken, and recheck with screen=false only if the user wants that exact name. Never turn not_found, unknown, unsupported or missing DNS into available, and never assume an unstated renewal period is annual.
For shortest-name searches, page through shortSearch patterns and report the shortest found within the explored scope.
The tools look names up; they never buy, reserve or register them.`;

function toolResult(value: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    structuredContent: { ...value },
  };
}

export function createMcpServer(engine = new DomainEngine()) {
  const handlers = createToolHandlers(engine);
  const server = new McpServer({ name: 'domain-scout', version: '0.4.1' }, { instructions });
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
