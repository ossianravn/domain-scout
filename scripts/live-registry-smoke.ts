import { writeFile, writeFileSync } from 'node:fs';
import { DomainEngine } from '../src/engine.js';
import { createRdapProvider } from '../src/providers/rdap.js';
import { createSidnProvider } from '../src/providers/sidn.js';
import { createNetworkContext } from '../src/transport.js';

// Reproducible public-registry smoke check; synthetic names are observations,
// never recommendations or guaranteed-unregistered probes.
const context = createNetworkContext();
const engine = new DomainEngine({ context,
  providers: [createSidnProvider(context), createRdapProvider(context)] });
const names = ['sidn.nl', 'domain-scout-20261024-7ac5c9e21.nl',
  'denic.de', 'domain-scout-20261024-7ac5c9e21.de',
  'nic.ch', 'domain-scout-20261024-7ac5c9e21.ch'];
const output = await engine.check(names, true, 10000);
const json = `${JSON.stringify({ runAt: new Date().toISOString(), ...output }, null, 2)}\n`;
if (process.argv[2]) await new Promise<void>((resolve, reject) =>
  writeFile(process.argv[2]!, json, error => error ? reject(error) : resolve()));
writeFileSync(1, json);
