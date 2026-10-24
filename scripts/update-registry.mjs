import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IANA_REGISTRY_URL, parseRegistrySnapshot } from '../src/registry-catalog.ts';

// Run: node --import tsx scripts/update-registry.mjs [local-iana-json]
const input = process.argv[2];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let raw;
if (input) raw = JSON.parse(await readFile(resolve(input), 'utf8'));
else {
  const response = await fetch(IANA_REGISTRY_URL);
  if (!response.ok) throw new Error(`IANA registry refresh returned HTTP ${response.status}`);
  raw = await response.json();
}
const snapshot = parseRegistrySnapshot(raw);
const target = resolve(root, 'src/data/registry-snapshot.json');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(snapshot)}\n`);
const rdap = snapshot.routes.filter(route => route.rdapUrls.length).length;
const whois = snapshot.routes.filter(route => route.whoisServer).length;
const routed = snapshot.routes.filter(route => route.rdapUrls.length || route.whoisServer).length;
console.log(JSON.stringify({ generatedAt: snapshot.generatedAt, activeTlds: snapshot.routes.length,
  rdapTlds: rdap, whoisTlds: whois, routedTlds: routed, file: target,
  nextStep: 'Rebuild the plugin to embed the updated snapshot.' }, null, 2));
