# Providers and interpretation

Version **0.2.0**, reviewed against official documentation on **24 October 2026**.
This describes routing and response interpretation. [Validation](validation.md)
separates fixture checks, live results and unresolved environment limitations.

## Routing and source discovery

For each name, the ordered chain is **Simply → Punktum → ISNIC →
Internetstiftelsen → DNS Belgium → SWITCH → SIDN → Vercel → RDAP → WHOIS →
Who-Dat**. Only sources supporting that name and enabled configuration are used.
Only `unknown` or `unsupported` results continue to the next applicable source;
completed outcomes, including `not_found`, retain their evidence. Fallbacks
preserve earlier failure attempts and obey the same whole-call wait budget.

The bundled [IANA registry catalog](catalog.md) has 1,437 active root records,
1,207 with RDAP routes after official supplements, 871 with WHOIS routes and
1,367 with either route. Counts describe routing metadata, not live endpoint
success, parser coverage, unrestricted registration or the set of routes enabled
by a particular adapter. Generic WHOIS excludes some catalog-listed services.

`domain_sources` reports catalog dates/counts, requested suffix routes, dedicated
checks and configured optional sources. It makes no network request by default.
`refresh: true` updates IANA metadata in memory; failed refreshes retain the
previous catalog. It does not test upstream availability. CLI equivalent:

```sh
node dist/cli.cjs sources '{"tlds":["dk","com","co.uk","de","ch","nl"]}'
```

## Simply `.dk` registrar confirmation

- Enabled by `SIMPLY_API_KEY` or `SIMPLY_API_TOKEN`; sends that credential as a
  Bearer token to `GET https://api.simply.com/2/my/domaincheck/{domain}/`.
- Require the returned domain to match and both `available` and `canregister`
  to be explicit. Both true means `available`; a restricted name is `unavailable`.
- Four requests may run concurrently. HTTP errors and `Retry-After` remain
  explicit; no registration price is invented when absent.

References: [authentication and limits](https://www.simply.com/dk/docs/api/),
[OpenAPI specification](https://api.simply.com/2/doc.json).

## Punktum `.dk` WHOIS

- Query `whois.punktum.dk`, TCP 43, requesting UTF-8; one request in flight and
  starts at least one second apart. Registrant handles are unnecessary.
- A matching name, recognized registration status and registration date yield
  `registered`. An offered waiting-list name is `unavailable`.
- The recognized no-entry response is `not_found`, requiring registrar
  confirmation. Malformed or failed responses remain `unknown`.

Reference: [Punktum WHOIS specification](https://github.com/Punktum-dk/whois-service-specification).
The exact negative response and native TCP connectivity remain subject to the
live-validation limitations recorded in [validation.md](validation.md).

## ISNIC `.is` DAC

- `GET https://rdap.isnic.is/rdap/dac/{domain}`.
- Published allowance: 7,200 requests per 30 minutes. Starts are spaced 250 ms
  apart, with four concurrent requests.
- Only its explicit availability response becomes `available`. Existence,
  pending or invalid outcomes are `unavailable`; a bare/HTML 404 is insufficient.
- Generic RDAP and WHOIS exclude `.is` to preserve its dedicated service budget.

Reference: [ISNIC RDAP and availability specification](https://www.isnic.is/en/api/rdap).

## Internetstiftelsen `.se` / `.nu` Free service

- `http://free.iis.se/free?q={domain}` and `http://free.iis.nu/free?q={domain}`.
- Published limit: 34 requests/second/user. Starts are spaced 30 ms apart with
  four in flight. Transport is the documented HTTP service.
- A recognized `free` or `occupied` reply must name the exact requested domain;
  these map to `available` and `registered`. The service supplies no prices.

Reference: [rules and description of domain searches](https://internetstiftelsen.se/en/domains/how-to-register-a-domain-name/rules-and-description-of-domain-name-searches/).

## DNS Belgium `.be` DAS

- Send the complete domain to `das.dns.be`, TCP 4343. Require one successful
  return code and matching domain/A-label fields before interpreting status.
- `AVAILABLE` means `available`; `NOT AVAILABLE` means `registered`;
  `NOT ALLOWED` means `invalid`. Internal errors, blocked access and excessive
  queries are `unknown`, with distinct reasons.
- Published limit: 50 queries/minute/IP. One request runs at a time with
  1,200 ms spacing. Excessive-query replies trigger an estimated 60-second
  cooldown; the registry's actual reset is the end of its minute.

Reference: [DNS Belgium WHOIS and DAS](https://docs.dnsbelgium.be/be/general/whoisanddas.html).

## SWITCH `.ch` / `.li` Domain Check

- Send the complete domain to `whois.nic.ch`, TCP 4343. Interpret the stable
  numeric reply, not changeable human-readable text.
- Code `1` means `available`; `0` means `unavailable`; `-1` means `invalid`.
  Access restriction `-95` and temporary failure `-99` remain `unknown`.
- Two requests can run concurrently, with 250 ms spacing. That is local pacing,
  not a registry-published quota. Access restrictions use an estimated
  60-second cooldown when the registry supplies no reset time.

Reference: [SWITCH Domain Check](https://www.nic.ch/whois/domaincheck/).

## SIDN `.nl` RDAP availability

- `GET https://rdap.sidn.nl/domain/{domain}` with four concurrent requests and
  100 ms spacing; this is local pacing, not a claimed published quota.
- A 404 becomes `available` only with a matching domain object and the exact
  status array `["free"]`. A structured no-record error without explicit free
  status remains `not_found`.
- A matching 200 response is `unavailable`: SIDN can return records for withheld
  or excluded names, so the adapter does not claim every such name is registered.
- Mismatched names, contradictory free/200 responses and malformed data remain
  `unknown`. Generic RDAP and WHOIS do not bypass this specialized adapter.

Reference: [SIDN RDAP Manual v1.4, section 2.1](https://www.sidn.nl/downloads/1l3dvAfH8Ppqnjl0Y7p0jL/7f4d9399e83188bf6f68f68af9179d10/RDAP_Manual_v1.4.pdf).

## Vercel Registrar API

- `GET https://api.vercel.com/v1/registrar/tlds/supported` discovers coverage;
  `POST https://api.vercel.com/v1/registrar/domains/search` checks exact names.
- Public search accepts 1–200 domains per request and can return registration
  and renewal quotes in USD. The plugin chunks larger lists and runs two batches
  concurrently. No undocumented numeric API quota is assumed.
- Only a catalog-supported suffix can yield `available` or `unavailable` from
  the returned availability boolean. Unsupported suffixes are not inferred taken.
- Registration periods use the supplied `years`. Renewal amounts retain an
  unknown period unless one is established. HTTP errors preserve retry evidence.

References: [registrar API guide](https://vercel.com/docs/domains/registrar-api),
[search endpoint](https://vercel.com/docs/rest-api/domains-registrar/get-domain-availability-and-pricing),
[public search announcement](https://vercel.com/changelog/search-domains-without-authentication).

## Catalog-routed RDAP

- Look up the longest matching suffix in the bundled/explicitly refreshed
  catalog. Preserve all published base URLs and try alternatives after unresolved
  failures, within the caller's deadline. Dedicated ISNIC/SIDN checks remain separate.
- Up to four requests run concurrently **per upstream host**. A rate-limited
  host's cooldown does not pause unrelated hosts. Respect `Retry-After`.
- Require a matching domain object for positive evidence. Reserved/withheld
  records map to `unavailable`; other recognized records map to `registered`.
  SWITCH RDAP positives remain `unavailable` because its meaning includes names
  that cannot currently be registered.
- Structured no-record 404s map to `not_found`. SWITCH also documents an empty
  404 body; it has an explicit exception. Arbitrary HTML 404s, conflicting names,
  error objects presented as registrations and malformed responses stay `unknown`.

References: [IANA root registry](https://www.iana.org/domains/root/files),
[RFC 9083](https://www.rfc-editor.org/rfc/rfc9083.html),
[RFC 9224](https://www.rfc-editor.org/rfc/rfc9224.html),
[DENIC pilot](https://www.denic.de/en/rdap-master/),
[SWITCH RDAP](https://www.nic.ch/whois/rdap/).

## Catalog-routed WHOIS

- Use the catalog's published TCP 43 host. Send domain-specific queries for
  Verisign, DENIC and JPRS; other hosts receive the canonical ASCII domain.
- One request per host can be active. Starts are spaced 1,000 ms apart by default,
  configurable through `DOMAIN_SCOUT_WHOIS_INTERVAL_MS`. This local setting does
  not imply a universal registry allowance. Separate hosts have independent queues.
- Matching registration evidence yields `registered`; explicit reserved/blocked
  states yield `unavailable`; recognized no-record replies yield `not_found`.
  The parser does not claim every registry dialect. Errors, mismatches and
  unrecognized formats remain `unknown`; rate-limit replies estimate a 60-second cooldown.
- Generic WHOIS excludes `.dk`, `.is`, `.be`, `.ch`, `.li`, `.nl`, `.se` and `.nu`
  because dedicated checks have separate semantics/budgets. It also excludes
  `.pl` and `.no`; NASK publishes a small daily allowance and Norid's WHOIS
  directory is intended for operational/contact lookup rather than availability.

References: [WHOIS protocol](https://www.rfc-editor.org/rfc/rfc3912.html),
[NASK WHOIS FAQ](https://www.dns.pl/en/whois/FAQ),
[Norid directory purpose](https://www.norid.no/en/domeneoppslag/vilkar/).

## Optional Who-Dat bridge

Set `DOMAIN_SCOUT_WHO_DAT_URL` to an owner-provided HTTP(S) endpoint; optionally
set `DOMAIN_SCOUT_WHO_DAT_TOKEN`. This final fallback calls `/v1/whois/{domain}`
and validates both query and returned domain. A positive registration result
maps to `registered`; `isRegistered: false` remains `unknown`, because that value
can also represent reserved or blocked names. It never yields `available`.

Who-Dat queries the same underlying registries and may cache answers. The plugin
retains supplied observation time/cache metadata; `fresh: true` cannot bypass
upstream caches. See [Who-Dat setup and audited sources](who-dat.md). No public
demo is configured automatically.

## Time, caching and evidence

The default whole-call wait budget is ten seconds. Completed results return
while unresolved names become `unknown` with `time_budget_exhausted`. Queued
checks do not start after their deadline; already active bounded requests may
finish and populate the cache. RDAP alternatives share the remaining deadline.

Local evidence has a configurable 60-second TTL. Expired entries are pruned,
unknown outcomes are not cached, and identical in-progress lookups share work.
The scheduler coordinates one MCP process, not every process sharing an IP.
No-record evidence does not establish eligibility, premium pricing or purchase
terms. See the [research review](research-review.md) for these distinctions and
why DNS/CZDS are deferred to a possible hosted deployment.
