import type { Availability, DomainName } from '../types.js';
import { sameDomain } from './shared.js';

export interface WhoisClassification { status: Availability; reason?: string }
const unknown = (reason = 'invalid_response'): WhoisClassification => ({ status: 'unknown', reason });

/** Original conservative classifier, informed by protocol examples and public fixtures:
 * https://github.com/LayeredStudio/whoiser/issues/117
 * https://github.com/likexian/whois-parser/tree/master/testdata
 * https://github.com/rfc1036/whois
 * https://github.com/saidutt46/domain-check/tree/main/domain-check-lib/tests/fixtures/whois
 * This deliberately does not claim to parse every registry dialect.
 */
function field(line: string): [string, string] | undefined {
  const match = /^(?:[a-z]\.\s*)?\[([a-z][a-z -]+)\]\s*:?\s*(\S.*?)\s*$/i.exec(line)
    ?? /^([a-z][a-z _.-]*):\s*(\S.*?)\s*$/i.exec(line);
  if (!match) return undefined;
  return [match[1]!.toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim(), match[2]!];
}

const domainField = (key: string) => ['domain', 'domain name', 'domainname'].includes(key);
const statusField = (key: string) => ['status', 'state', 'domain status'].includes(key);
const registrationStatus = /^(?:active|ok|connect|registered|delegated|inactive|live|redemptionperiod|pendingdelete|pendingtransfer|client(?:hold|deleteprohibited|renewprohibited|transferprohibited|updateprohibited)|server(?:hold|deleteprohibited|renewprohibited|transferprohibited|updateprohibited))(?:$|[ ,])/i;
const reservedStatus = /^(?:reserved|blocked|restricted|unavailable|not available|not allowed)$/i;
const negativeStatus = /^(?:free|available|not registered|unregistered)$/i;

function domainRecord(lines: string[], start: number): [string, string][] {
  const fields: [string, string][] = [];
  let blank = false;
  for (const line of lines.slice(start)) {
    if (!line) { blank = true; continue; }
    if (/^>>>|^terms of use\b/i.test(line)) break;
    const pair = field(line);
    // FRED-style recursive replies append contact/nsset objects after the domain.
    if (pair && blank && ['contact', 'nic-hdl', 'nsset', 'keyset', 'person'].includes(pair[0])) break;
    blank = false;
    if (pair) fields.push(pair);
  }
  return fields;
}

function registered(fields: [string, string][]): boolean {
  const has = (keys: string[], valid: (value: string) => boolean) =>
    fields.some(([key, value]) => keys.includes(key) && valid(value));
  const useful = (value: string) => !/^(?:n\/?a|none|not applicable|redacted|-)$/i.test(value);
  if (has(['registry domain id', 'domain id'], value => useful(value) && /^[\w.-]+$/.test(value))) return true;
  if (has(['creation date', 'created', 'created on', 'created date', 'registered', 'registered on', 'registration time'],
    value => /\d{4}/.test(value) && Number.isFinite(Date.parse(value)))) return true;
  if (fields.some(([key, value]) => statusField(key) && registrationStatus.test(value))) return true;
  return has(['registrar', 'sponsoring registrar'], useful)
    && has(['nserver', 'name server', 'nameserver'], value => /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+\.?\b/i.test(value));
}

export function classifyWhois(text: string, name: DomainName): WhoisClassification {
  if (!text.trim() || /<(?:!doctype|html)\b/i.test(text) || /^HTTP\/\d/m.test(text)) return unknown();
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const messages = lines.map(line => line.replace(/^[%#]+\s*/, ''));
  const limited = messages.some(line =>
    /^(?:error:\s*)?(?:too many (?:queries|requests|connections)|(?:query|request|connection|rate|daily|hourly) (?:rate )?limit(?:s)? (?:exceeded|reached))\b/i.test(line)
    || /^your (?:connection|request|query|ip)\b.*\b(?:limit|quota)\b.*\b(?:exceeded|reached)\b/i.test(line)
    || /^(?:error:\s*)?(?:maximum query rate|query rate(?: limit)?|number of allowed queries|whois limit)\b.*\b(?:exceeded|reached)\b/i.test(line)
    || /^access to (?:the )?(?:whois|whois and rdap) services? is rate limited\b/i.test(line)
    || /^(?:error:\s*\d+:\s*)?quota exceeded\b/i.test(line));
  if (limited) return unknown('rate_limited');
  if (messages.some(line => /^(?:error:\s*(?:\d+:\s*)?)?(?:access (?:denied|restricted)|temporarily banned|ip (?:address )?blocked)\b/i.test(line))) {
    return unknown('access_blocked');
  }
  if (messages.some(line => /^(?:error|service unavailable|internal server error)\b/i.test(line)
    && !/^error:\s*101:\s*no entries found\.?$/i.test(line))) return unknown('registry_error');

  const identifiers = lines.map(field).filter((pair): pair is [string, string] => Boolean(pair && domainField(pair[0])));
  if (identifiers.some(([, value]) => !sameDomain(value, name))) return unknown('domain_mismatch');
  if (identifiers.length) {
    const start = lines.findIndex(line => { const pair = field(line); return pair && domainField(pair[0]); });
    const fields = domainRecord(lines, start);
    const states = fields.filter(([key]) => statusField(key)).map(([, value]) => value);
    if (states.some(state => reservedStatus.test(state))) return { status: 'unavailable', reason: 'registry_reports_unavailable' };
    // Registration evidence wins over no-record words in explanatory boilerplate.
    if (registered(fields)) return { status: 'registered' };
    if (states.length === 1 && negativeStatus.test(states[0]!)) return { status: 'not_found' };
  }

  let negative = false;
  for (const line of messages) {
    const named = /^no match for(?: domain)?\s+["']?([^\s"']+)["']?\.?$/i.exec(line)
      ?? /^domain\s+["']?([^\s"']+)["']?\s+(?:not found|does not exist)\.?$/i.exec(line)
      ?? /^not found:\s*([^\s]+)\s*$/i.exec(line);
    if (named) {
      if (!sameDomain(named[1], name)) return unknown('domain_mismatch');
      negative = true;
    }
    if (/^(?:no match(?: found)?|no entries found|no data found|no object found|no matching (?:record|objects?)|(?:domain )?not found|nothing found)[.!]{0,2}$/i.test(line)
      || /^error:\s*101:\s*no entries found\.?$/i.test(line)
      || /^no entries found for the selected source(?:\(s\))?\.$/i.test(line)) negative = true;
  }
  return negative ? { status: 'not_found' } : unknown();
}
