import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await build({
  absWorkingDir: root,
  entryPoints: { server: 'src/server.ts', cli: 'src/cli.ts' },
  outdir: 'dist', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  minify: true, metafile: true, legalComments: 'eof',
});
const packages = new Set();
for (const input of Object.keys(output.metafile.inputs)) {
  const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(input);
  if (match) packages.add(match[1]);
}
const notices = ['# Bundled dependency notices\n\nGenerated from the dependencies included by esbuild.\n',
  `\n${await readFile(join(root, 'DATA_SOURCES.md'), 'utf8')}\n`];
for (const name of [...packages].sort()) {
  const folder = join(root, 'node_modules', name);
  const metadata = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'));
  const files = (await readdir(folder)).filter(file => /^(license|copying|notice)(\.|$)/i.test(file));
  if (!files.length) throw new Error(`No license file found for bundled dependency ${name}`);
  notices.push(`\n## ${name} ${metadata.version}\n`);
  for (const file of files) notices.push(`\n${file}\n\n${await readFile(join(folder, file), 'utf8')}\n`);
}
await writeFile(join(root, 'THIRD_PARTY_NOTICES.md'), notices.join(''));
const scripts = join(root, 'skills/find-domains/scripts');
await mkdir(scripts, { recursive: true });
await copyFile(join(root, 'dist/cli.cjs'), join(scripts, 'domain-scout.cjs'));
await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(scripts, 'THIRD_PARTY_NOTICES.md'));
console.log('Built dist/server.cjs and dist/cli.cjs; updated skill fallback and dependency notices.');
