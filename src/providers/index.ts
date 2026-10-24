import { type DomainProvider, type ProviderContext } from '../types.js';
import { RegistryCatalog } from '../registry-catalog.js';
import { createBelgiumProvider, createSwitchProvider } from './das.js';
import { createDkProvider } from './dk.js';
import { createIisProvider } from './iis.js';
import { createIsnicProvider } from './isnic.js';
import { createRdapProvider } from './rdap.js';
import { createSimplyProvider } from './simply.js';
import { createSidnProvider } from './sidn.js';
import { createVercelProvider } from './vercel.js';
import { createWhoisProvider } from './whois.js';
import { createWhoDatProvider } from './who-dat.js';

export { createDkProvider, createIisProvider, createIsnicProvider,
  createRdapProvider, createSimplyProvider, createVercelProvider, createBelgiumProvider,
  createSwitchProvider, createSidnProvider, createWhoisProvider, createWhoDatProvider };

export function createProviders(ctx: ProviderContext, catalog = new RegistryCatalog()): DomainProvider[] {
  return [createSimplyProvider(ctx), createDkProvider(ctx), createIsnicProvider(ctx),
    createIisProvider(ctx), createBelgiumProvider(ctx), createSwitchProvider(ctx),
    createSidnProvider(ctx), createVercelProvider(ctx), createRdapProvider(ctx, catalog),
    createWhoisProvider(ctx, catalog), createWhoDatProvider(ctx)];
}
