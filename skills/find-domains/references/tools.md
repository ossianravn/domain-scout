# Domain Scout tool reference

## Access

Prefer the plugin's MCP tools. Hosts may prefix the names; locate
`prepare_domain_search`, `check_domains`, and `domain_sources` by their descriptions.
If MCP is unavailable and shell execution is available, use the bundled Node
22+ script at `scripts/domain-scout.cjs`, relative to this skill directory.
Run it with `prepare`, `check`, or `sources`. Supply a JSON object as the next argument, or
send JSON on stdin. Use a structured process API or safe shell quoting.

```sh
node /absolute/path/to/find-domains/scripts/domain-scout.cjs prepare '{"project":"A second brain app","namingStyles":["mixed"]}'
node /absolute/path/to/find-domains/scripts/domain-scout.cjs check '{"domains":["example.com"],"fresh":true}'
```

If neither MCP nor shell execution is available, explain that live checking is
unavailable in this environment. Creative ideas can still be marked unverified.
Do not guess availability or claim the bundled server was called.

## prepare_domain_search

Required: `project` (string describing purpose and users).

| Optional field | Meaning |
| --- | --- |
| `audience`, `language` | Intended users and naming language/market |
| `namingStyles` | Array: descriptive, suggestive, metaphorical, playful, invented, domain_phrase, mixed |
| `tlds` | Preferred or required suffixes, such as dk, com, co.uk |
| `tldPreference` | required or preferred |
| `priority` | balanced, shortest, clarity, brand, price |
| `budget` | Object: currency, optional purchase and renewal amounts |
| `allowPremium`, `allowAftermarket` | Explicit acquisition preferences |
| `favorites`, `rejected` | Previous names or directions |
| `shortSearch` | Pattern search object below |

`shortSearch` requires `patterns` (array of C/V/L/D strings) and `tlds`.
Optional: `pageSize` (default 60, adjustable), `cursor`, and `exclude` (exact
names). Page size controls one response, not the total search space.
The response contains a brief, illustrated questions, semantic directions,
generation guidance, and optional paginated unverified strings.

## check_domains

```json
{
  "domains": ["example.com", "example.dk"],
  "fresh": false,
  "maxWaitMs": 10000
}
```

`domains` is required and accepts exact registrable domains, including IDNs.
Subdomains, URLs, paths, and public suffixes alone are invalid.
`fresh` bypasses the short evidence cache; simultaneous live checks can be
shared. `maxWaitMs` controls how long the call waits. Unfinished results remain
unknown with `reason: time_budget_exhausted`. Already active requests may finish
and populate the cache; queued requests do not start after their deadline.

Each result preserves status, source, check time, evidence, and any reason,
retry interval, fallback history, or pricing. A price has currency, registration,
registrationYears, renewal, renewalYears, and premium. Null means not established.
`registry` identifies the upstream host where known. Optional `observedAt` and
`upstreamCached` distinguish older proxy evidence from this plugin's check time.
The `fresh` flag cannot invalidate an independently managed upstream cache.
The summary reports input count, unique names, cache hits, elapsed milliseconds,
wait budget, and deferred count. Duplicate inputs retain their positions.

## domain_sources

```json
{"tlds":["dk","de","co.uk"],"refresh":false}
```

Both inputs are optional. Without refresh, this tool performs no network calls.
It reports catalog age, route counts, requested suffix routes, enabled generic
adapters, dedicated services, and optional provider configuration without secrets.
`refresh: true` updates routing metadata in this running server. Failed refreshes
retain the last good catalog. Counts describe published metadata, not proven
working endpoints, universal parsing, or public registrability.

## Credentials and defaults

Default public sources need no key. For the optional Simply `.dk` registrar
check, inherit `SIMPLY_API_KEY` or `SIMPLY_API_TOKEN` from the host environment.
Never ask for a key in chat or place it in tool arguments. An account identifier
is unnecessary. The server does not implicitly load `.env` files.

Operational environment overrides:

- `DOMAIN_SCOUT_TIMEOUT_MS`: per-request timeout, default 8000.
- `DOMAIN_SCOUT_CACHE_TTL_MS`: evidence cache duration, default 60000; zero disables it.
- `DOMAIN_SCOUT_MAX_WAIT_MS`: default whole-call wait budget, default 10000.
- `DOMAIN_SCOUT_WHOIS_INTERVAL_MS`: local per-registry WHOIS pacing, default 1000.
- `DOMAIN_SCOUT_WHO_DAT_URL`: optional self-hosted Who-Dat fallback URL.
- `DOMAIN_SCOUT_WHO_DAT_TOKEN`: optional bearer token for that service.

Who-Dat is disabled without its URL. It supplies registration evidence; a false
registration flag remains unknown because upstream errors can be collapsed.

The server sends queried domains to selected providers. It does not send the
naming brief, purchase names, or invoke an external language model.
