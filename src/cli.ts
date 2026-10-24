import { createToolHandlers } from './tools.js';

const usage = `Domain Scout 0.4.1 — Node 22+

  node dist/cli.cjs prepare '<JSON brief>'
  node dist/cli.cjs check '<JSON domains object>'
  node dist/cli.cjs sources '{"tlds":["dk","com"]}'

Omit the JSON argument, or use -, to read JSON from stdin.
prepare accepts the prepare_domain_search tool input.
check accepts {"domains":["example.com"],"fresh":false}.
sources accepts {"tlds":[],"refresh":false}.
The output is JSON. Generated names are unverified until checked.
`;

async function main() {
  const command = process.argv[2];
  if (!command || ['--help', '-h'].includes(command)) {
    process.stdout.write(usage);
    return;
  }
  const handlers = createToolHandlers();
  const handler = command === 'prepare' ? handlers.prepare_domain_search
    : command === 'check' ? handlers.check_domains
      : command === 'sources' ? handlers.domain_sources : undefined;
  if (!handler) throw new Error('Unknown command. Use prepare, check, sources, or --help.');
  const argument = process.argv[3];
  let raw = argument && argument !== '-' ? argument : '';
  if (!raw) {
    if (process.stdin.isTTY) throw new Error('Provide JSON as an argument or on stdin.');
    for await (const chunk of process.stdin) raw += chunk;
  }
  const result = await handler(JSON.parse(raw));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
