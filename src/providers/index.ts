import { type DomainName, type DomainProvider, type ProviderContext } from '../types.js';
import { RegistryCatalog } from '../registry-catalog.js';
import { createBelgiumProvider, createSwitchProvider } from './das.js';
import { createDnsScreenProvider } from './dns-screen.js';
import { createDkProvider } from './dk.js';
import { createIisProvider } from './iis.js';
import { createIsnicProvider } from './isnic.js';
import { createRdapProvider } from './rdap.js';
import { createSimplyProvider } from './simply.js';
import { createSidnProvider } from './sidn.js';
import { createVercelProvider } from './vercel.js';
import { createWhoisProvider } from './whois.js';
import { createWhoDatProvider } from './who-dat.js';

export { createDnsScreenProvider, createDkProvider, createIisProvider, createIsnicProvider,
  createRdapProvider, createSimplyProvider, createVercelProvider, createBelgiumProvider,
  createSwitchProvider, createSidnProvider, createWhoisProvider, createWhoDatProvider };

export function createProviders(ctx: ProviderContext, catalog = new RegistryCatalog()): DomainProvider[] {
  const chain = [createSimplyProvider(ctx), createDkProvider(ctx), createIsnicProvider(ctx),
    createIisProvider(ctx), createBelgiumProvider(ctx), createSwitchProvider(ctx),
    createSidnProvider(ctx), createVercelProvider(ctx), createRdapProvider(ctx, catalog),
    createWhoisProvider(ctx, catalog), createWhoDatProvider(ctx)];
  const needsScreen = async (name: DomainName): Promise<boolean> => {
    try {
      for (const provider of chain) {
        if (await provider.supports(name)) return provider.id === 'whois' || provider.minIntervalMs >= 500;
      }
    } catch { return false; }
    return false;
  };
  return [createDnsScreenProvider(ctx, needsScreen), ...chain];
}
