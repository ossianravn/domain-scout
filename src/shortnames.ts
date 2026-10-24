import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { z } from 'zod/v4';

const alphabet = {
  C: 'bcdfghjklmnpqrstvwxyz',
  V: 'aeiou',
  L: 'abcdefghijklmnopqrstuvwxyz',
  D: '0123456789',
} as const;
type Symbol = keyof typeof alphabet;

export const shortSearchSchema = z.object({
  patterns: z.array(z.string().trim().toUpperCase().regex(/^[CVLD]+$/).max(63)).min(1)
    .describe('Explicit patterns: C consonant, V vowel, L letter, D digit. Example: CV, VC, CVC.'),
  tlds: z.array(z.string().trim().min(1)).min(1)
    .describe('Explicit suffixes, such as com, .to, or co.uk; coverage is checked separately.'),
  pageSize: z.number().int().positive().safe().default(60)
    .describe('Candidate count for this page, not a total search limit.'),
  cursor: z.string().optional(),
  exclude: z.array(z.string()).default([])
    .describe('Exact domains already checked or rejected in this search.'),
});
export type ShortSearchInput = z.input<typeof shortSearchSchema>;

function normalizeDnsName(raw: string, maxLength: number): string {
  const value = raw.trim().replace(/\.$/, '').toLowerCase();
  // domainToASCII uses URL hostname parsing and can silently discard /paths,
  // queries and fragments. Reject those before the IDNA conversion.
  if (/[\s/\\:#?@%]/u.test(value)) throw new Error(`Expected a DNS name, received: ${raw}`);
  const name = domainToASCII(value);
  if (!name || name.length > maxLength || name.split('.').some(label =>
    label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error(`Invalid DNS name: ${raw}`);
  }
  return name;
}

export function normalizeDomainSuffix(raw: string): string {
  return normalizeDnsName(raw.trim().replace(/^\./, ''), 251);
}

// Count and unrank the union of pattern languages. Overlapping patterns such as
// L and C never generate duplicates, even when a page resumes far into a search.
function patternLanguage(patterns: string[]) {
  const width = patterns[0].length;
  const cache = new Map<string, bigint>();
  const transitions = (position: number, active: number[]) => {
    const letters = new Map<string, number[]>();
    for (const index of active) {
      for (const letter of alphabet[patterns[index][position] as Symbol]) {
        const next = letters.get(letter) ?? [];
        next.push(index);
        letters.set(letter, next);
      }
    }
    return [...letters.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  };
  const count = (position: number, active: number[]): bigint => {
    if (position === width) return 1n;
    const key = `${position}:${active.join(',')}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const total = transitions(position, active).reduce(
      (sum, [, next]) => sum + count(position + 1, next), 0n,
    );
    cache.set(key, total);
    return total;
  };
  const initial = patterns.map((_, index) => index);
  const total = count(0, initial);
  const at = (ordinal: bigint): string => {
    let active = initial;
    let label = '';
    for (let position = 0; position < width; position++) {
      for (const [letter, next] of transitions(position, active)) {
        const size = count(position + 1, next);
        if (ordinal < size) {
          label += letter;
          active = next;
          break;
        }
        ordinal -= size;
      }
    }
    return label;
  };
  return { total, at };
}

function decodeCursor(cursor: string | undefined, signature: string): bigint {
  if (!cursor) return 0n;
  try {
    const data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (data.version !== 1 || data.signature !== signature || !/^\d+$/.test(data.offset)) {
      throw new Error('mismatch');
    }
    return BigInt(data.offset);
  } catch {
    throw new Error('The short-search cursor is invalid or belongs to different patterns, suffixes, or exclusions. Start without a cursor.');
  }
}

export function generateShortDomains(input: ShortSearchInput) {
  const options = shortSearchSchema.parse(input);
  const patterns = [...new Set(options.patterns)].sort();
  const tlds = [...new Set(options.tlds.map(normalizeDomainSuffix))].sort();
  const excluded = new Set(options.exclude.map(value => normalizeDnsName(value, 253)));
  const signature = createHash('sha256').update(JSON.stringify({
    patterns, tlds, exclude: [...excluded].sort(),
  })).digest('hex');
  const lengths = [...new Set(patterns.map(pattern => pattern.length))];
  const languages = new Map(lengths.map(length => [
    length, patternLanguage(patterns.filter(pattern => pattern.length === length)),
  ]));
  const groups = tlds.flatMap(tld => lengths.map(length => ({
    tld, length, hostnameLength: length + 1 + tld.length, language: languages.get(length)!,
  }))).filter(group => group.hostnameLength <= 253).sort((a, b) =>
    a.hostnameLength - b.hostnameLength || a.tld.localeCompare(b.tld) || a.length - b.length);
  const total = groups.reduce((sum, group) => sum + group.language.total, 0n);
  let offset = decodeCursor(options.cursor, signature);
  if (offset > total) throw new Error('The short-search cursor exceeds this search space.');
  let groupIndex = 0;
  let ordinal = offset;
  while (groupIndex < groups.length && ordinal >= groups[groupIndex].language.total) {
    ordinal -= groups[groupIndex++].language.total;
  }
  const candidates: Array<{ domain: string; hostnameLength: number; labelLength: number }> = [];
  let skippedExcluded = 0;
  while (groupIndex < groups.length && candidates.length < options.pageSize) {
    const group = groups[groupIndex];
    const domain = `${group.language.at(ordinal)}.${group.tld}`;
    ordinal++;
    offset++;
    if (excluded.has(domain)) skippedExcluded++;
    else candidates.push({ domain, hostnameLength: group.hostnameLength, labelLength: group.length });
    if (ordinal === group.language.total) {
      groupIndex++;
      ordinal = 0n;
    }
  }
  const exhausted = offset === total;
  return {
    status: 'unverified' as const,
    candidates,
    nextCursor: exhausted ? null : Buffer.from(JSON.stringify({
      version: 1, signature, offset: offset.toString(),
    })).toString('base64url'),
    exhausted,
    scope: {
      patterns, tlds, pageSize: options.pageSize,
      totalPatternSpace: total.toString(), traversed: offset.toString(),
      providedExclusions: excluded.size, skippedExcluded,
      ordering: 'Complete ASCII hostname length, suffix, then label; overlapping patterns are deduplicated.',
      alphabet, registrationRules: 'Syntactic domain limits applied; registry-specific length and eligibility rules require lookup.',
    },
    nextAction: 'Select attractive candidates and call check_domains. These generated strings have no availability evidence.',
  };
}
