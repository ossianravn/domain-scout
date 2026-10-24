export const MAX_TIMER_MS = 2_147_483_647;

export function readSettings(env: Record<string, string | undefined> = process.env) {
  function number(key: string, fallback: number, allowZero = false, timer = false): number {
    const text = env[key];
    if (text === undefined || text === '') return fallback;
    const value = Number(text);
    if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)
      || (timer && value > MAX_TIMER_MS)) {
      throw new Error(`${key} must be a ${allowZero ? 'nonnegative' : 'positive'} safe integer in milliseconds${timer ? ` at most ${MAX_TIMER_MS}` : ''}`);
    }
    return value;
  }
  return {
    timeoutMs: number('DOMAIN_SCOUT_TIMEOUT_MS', 8000, false, true),
    cacheTtlMs: number('DOMAIN_SCOUT_CACHE_TTL_MS', 60000, true),
    maxWaitMs: number('DOMAIN_SCOUT_MAX_WAIT_MS', 10000, false, true),
  };
}
