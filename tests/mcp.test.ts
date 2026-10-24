import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/client/stdio';

const exec = promisify(execFile);

function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
  assert.ok(result.structuredContent && typeof result.structuredContent === 'object'
    && !Array.isArray(result.structuredContent), 'Tool result must contain a structured object');
  return result.structuredContent as Record<string, unknown>;
}

async function needsPipeBridge(): Promise<boolean> {
  // Some sandbox runtimes drop Node stream I/O on child_process socket pairs.
  // Diagnose that independently: the server must still pass over real OS pipes.
  const probe = await exec(process.execPath, ['-e', 'process.stdout.write("stdio-probe")'], { timeout: 3000 });
  if (probe.stdout === 'stdio-probe') return false;
  assert.equal(probe.stdout, '', 'Unexpected output from the independent Node stdio probe');
  assert.notEqual(process.platform, 'win32', 'This runtime cannot transport Node subprocess stdio');
  return true;
}

function launch(args: string[], bridge: boolean): Pick<StdioServerParameters, 'command' | 'args'> {
  return bridge
    ? { command: '/bin/sh', args: ['-c', 'cat | { "$@" 2>&1 1>&3 | cat >&2; } 3>&1 | cat',
      'domain-scout-stdio-test', process.execPath, ...args] }
    : { command: process.execPath, args };
}

async function bundledFolder() {
  const folder = await mkdtemp(join(tmpdir(), 'domain scout acceptance-'));
  await cp(resolve('dist'), join(folder, 'dist'), { recursive: true });
  return folder;
}

test('both plugin launch configurations work from a path with spaces, without node_modules', async t => {
  const folder = await bundledFolder();
  const bridge = await needsPipeBridge();
  if (bridge) t.diagnostic('Node subprocess socket I/O is unavailable; testing through ordinary OS pipes.');
  try {
    for (const manifest of ['mcp.json', '.claude-plugin/plugin.json']) {
      const config = JSON.parse(await readFile(manifest, 'utf8')).mcpServers['domain-scout'];
      const args = config.args.map((arg: string) => arg
        .replace('${PLUGIN_ROOT}', folder).replace('${CLAUDE_PLUGIN_ROOT}', folder));
      assert.equal(config.command, 'node');
      const transport = new StdioClientTransport({ ...launch(args, bridge), cwd: folder, stderr: 'pipe' });
      let stderr = '';
      transport.stderr?.on('data', chunk => { stderr += chunk; });
      const client = new Client({ name: 'domain-scout-acceptance', version: '1.0.0' });
      try {
        await client.connect(transport, { timeout: 5000 });
        assert.equal(client.getServerVersion()?.name, 'domain-scout');
        const listed = await client.listTools();
        assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['check_domains', 'domain_sources', 'prepare_domain_search']);
        const sources = structured(await client.callTool({ name: 'domain_sources', arguments: { tlds: ['.dk', 'de'] } }));
        assert.ok((sources.catalog as { activeTlds: number }).activeTlds > 1000);
        const extensions = sources.extensions as { suffix: string; publishedRoute: { whoisServer?: string; rdapUrls: string[] } }[];
        assert.deepEqual(extensions.map(row => row.suffix), ['dk', 'de']);
        assert.equal(extensions[0].publishedRoute.whoisServer, 'whois.punktum.dk');
        assert.ok(extensions[1].publishedRoute.rdapUrls.includes('https://rdap.denic.de/'));
        const prepared = await client.callTool({ name: 'prepare_domain_search', arguments: {
          project: 'A second brain for independent researchers', language: 'English',
        } });
        assert.equal(prepared.isError, undefined);
        assert.equal(structured(prepared).nextAction, 'ask_preferences');
        const short = await client.callTool({ name: 'prepare_domain_search', arguments: {
          project: 'A short URL service', namingStyles: ['invented'],
          shortSearch: { patterns: ['CV'], tlds: ['to'], pageSize: 3 },
        } });
        const generated = structured(short).shortSearch as { candidates: unknown[]; status: string };
        assert.equal(generated.status, 'unverified');
        assert.equal(generated.candidates.length, 3);
        const checked = await client.callTool({ name: 'check_domains', arguments: {
          domains: ['https://example.com', 'a.b.example.com'],
        } });
        const rows = structured(checked).results as { status: string }[];
        assert.deepEqual(rows.map(row => row.status), ['invalid', 'invalid']);
        const invalid = await client.callTool({ name: 'check_domains', arguments: { domains: [] } });
        assert.equal(invalid.isError, true);
        const prompts = await client.listPrompts();
        assert.equal(prompts.prompts[0].name, 'find_domains');
        const prompt = await client.getPrompt({ name: 'find_domains', arguments: { project: 'A Danish AI news site' } });
        assert.match(JSON.stringify(prompt.messages), /Danish AI news site/);
      } catch (error) {
        throw new Error(`${manifest}: ${error instanceof Error ? error.message : error}\nServer stderr: ${stderr || '(empty)'}`,
          { cause: error });
      } finally { await client.close(); }
      assert.equal(stderr, '', `Unexpected server stderr for ${manifest}`);
    }
    const fallbackCommand = launch([join(folder, 'dist/cli.cjs'), 'prepare', JSON.stringify({
      project: 'A teaching app', namingStyles: ['playful'], audience: 'Teachers planning lessons',
    })], bridge);
    const fallbackTask = exec(fallbackCommand.command, fallbackCommand.args ?? [], { cwd: folder, timeout: 5000 });
    fallbackTask.child.stdin?.end();
    const fallback = await fallbackTask;
    assert.equal(JSON.parse(fallback.stdout).nextAction, 'generate_candidates');
    assert.equal(fallback.stderr, '');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('bundled server supports the 2025-03-26 initialize handshake and text tool results', async () => {
  const folder = await bundledFolder();
  const transport = new StdioClientTransport({
    ...launch([join(folder, 'dist/server.cjs')], await needsPipeBridge()), cwd: folder, stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'domain-scout-legacy-acceptance', version: '1.0.0' }, {
    supportedProtocolVersions: ['2025-03-26'],
  });
  try {
    await client.connect(transport, { timeout: 5000 });
    assert.equal(client.getNegotiatedProtocolVersion(), '2025-03-26');
    assert.equal(client.getServerVersion()?.name, 'domain-scout');
    assert.equal((await client.listTools()).tools.length, 3);
    const prepared = await client.callTool({ name: 'prepare_domain_search', arguments: {
      project: 'A Danish AI news site', language: 'Danish', namingStyles: ['invented'],
    } });
    assert.equal(prepared.isError, undefined);
    const text = prepared.content?.find(item => item.type === 'text');
    assert.ok(text && typeof text.text === 'string');
    assert.equal(JSON.parse(text.text).nextAction, 'generate_candidates');
  } catch (error) {
    throw new Error(`Legacy MCP handshake: ${error instanceof Error ? error.message : error}\nServer stderr: ${stderr || '(empty)'}`,
      { cause: error });
  } finally {
    await client.close();
    await rm(folder, { recursive: true, force: true });
  }
  assert.equal(stderr, '');
});
