import { createConnection } from 'node:net';
import { readSettings } from './config.js';
import type { ProviderContext } from './types.js';

export function createNetworkContext(
  env: Record<string, string | undefined> = process.env,
): ProviderContext {
  const { timeoutMs } = readSettings(env);
  return {
    env, now: () => Date.now(),
    async request(url, init = {}) {
      const headers = new Headers(init.headers);
      if (!headers.has('user-agent')) headers.set('user-agent', 'DomainScout/0.4.0');
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const response = await fetch(url, { ...init, headers, signal });
      const text = await response.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* Text providers are intentional. */ }
      return { status: response.status, headers: response.headers, text, body };
    },
    whois(host, query, port = 43) {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const socket = createConnection({ host, port });
        const timer = setTimeout(() => socket.destroy(new Error('WHOIS request timed out')), timeoutMs);
        socket.on('connect', () => socket.write(`${query}\r\n`));
        socket.on('data', chunk => chunks.push(Buffer.from(chunk)));
        socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        socket.on('error', reject);
        socket.on('close', () => clearTimeout(timer));
      });
    },
  };
}
