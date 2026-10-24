# Validation report — Domain Scout 0.2.0

Validated on **24 October 2026**, using Node **24.19.0** on Linux. The release
targets Node 22+ and bundles the runtime dependencies for both plugin clients.

## Automated acceptance tests

`npm run check` passed strict TypeScript checking, rebuilt the bundles, and ran
**35 tests: 35 passed, zero failed or skipped**. The acceptance run took about
3.7 seconds, excluding typechecking and bundling.

| Area | Cases | Evidence |
| --- | ---: | --- |
| Naming | 6 | Preference questions, reused briefs, Danish directions, length ordering, overlapping patterns, cursor continuity, IDNs and malformed input |
| Existing providers and engine | 8 | Coverage routing, prices, DK/ISNIC/IIS semantics, failures, rate limits, deduplication, cache/fresh checks and Simply credentials |
| Packaged MCP | 2 | Both launch configurations, isolated folder with spaces, no node_modules, all three tools, prompt and CLI fallback, legacy protocol handshake |
| Latency and reliability | 9 | Partial results before deadline, fallback, independent source discovery, queued work cutoff, later caching, canonical keys, cooldown and timer bounds |
| Registry catalog | 1 | Immediate local routing, suffix precedence, explicit refresh, concurrent refresh sharing and retaining last-good data on failure |
| New dedicated services | 3 | Belgium DAS codes and matching, SWITCH numeric protocol, SIDN explicit free status and withheld records |
| Optional Who-Dat | 2 | Configuration, authentication, matching, old/cached observations, ambiguous negatives, failures and expired deadlines |
| Generic WHOIS | 2 | Query dialects, registration evidence, reserved/no-record distinctions, mismatches, privacy, per-host queues and deadlines |
| RDAP routing | 2 | Alternate endpoints, host isolation, host cooldown, malformed negatives, conflicting identity, reserved records and SWITCH-specific semantics |

The MCP checks execute each manifest's command and arguments after substituting
its plugin-root placeholder. They cover current SDK negotiation and an explicit
`2025-03-26` handshake with text results. Temporary installations contain only
built bundles; no local node_modules directory is needed.

This sandbox loses Node stream I/O on subprocess socket pairs. Tests detect that
independent runtime defect and use ordinary OS pipes here. Normal runtimes use
the direct SDK launch. Production code has no environment-specific workaround.

## Live network observations

These are individual observations, not percentile estimates or latency promises.
The host model's response time and client startup are not included in the engine
measurements. This environment required its network proxy and network permission.

| Check | Observed result |
| --- | --- |
| Six direct registry queries across `.nl`, `.de` and `.ch` | 827 ms total; five conclusive registration/no-record observations and one SIDN rate-limit response |
| DENIC | `denic.de` registered; synthetic name `not_found`, not available |
| SWITCH RDAP | `nic.ch` unavailable; synthetic name `not_found`, not available |
| SIDN | `sidn.nl` unavailable; the synthetic-name request returned HTTP 429 and remained unknown |
| Final bundled CLI: two `.com` names and one `.nl` name | 8,014 ms; Vercel returned one unavailable and one explicitly available result; SIDN timed out and remained unknown |

The Windows run below supersedes the SIDN and TCP-registry observations above.
Exact results are included in [live-registry-check-v0.2.json](live-registry-check-v0.2.json)
and [live-bundle-check-v0.2.json](live-bundle-check-v0.2.json). The direct check can
be repeated with `node --import tsx scripts/live-registry-smoke.ts` after installing
development dependencies. Synthetic domains are test observations, not suggested
brands, guaranteed-unregistered names, or reservations.

The mixed bundle run demonstrates why the wait budget is exposed: a fast source
cannot make a slow registry respond sooner. MCP callers can request a shorter
`maxWaitMs`, receive completed names promptly, and retry unresolved names later.
Acceptance tests verify that behavior and that expired queued work never starts.

In the previous 0.1.0 check, a cold 20-name `.com` batch took 2,299 ms and its
repeat used 20 cache hits. That historical baseline is not a measurement of every
provider or the expanded 0.2.0 catalog. The older three-name bundle result remains
in [live-bundle-check.json](live-bundle-check.json) for provenance.

## Catalog and package checks

The projected IANA snapshot was generated **2026-10-23T22:54:03+00:00**. It contains
1,437 active roots, 1,204 published RDAP routes, and 871 WHOIS routes. Three
explicit official RDAP supplements raise RDAP coverage to 1,207; the union stays
1,367 roots. Seventy active roots lack either route. These are metadata counts,
not tests of service availability, universal parsing, or open registration.

The v0.1 shared-skill frontmatter and both plugin formats were validated when
created. Version 0.2 retains those formats and adds the documented source tool.
Both MCP configurations are exercised again by the packaged acceptance tests.
All manifest/catalog JSON files parse, version fields agree, and the skill CLI
copy matches the main bundle. All authored source and test files are under 300
lines. Bundled dependency notices and catalog provenance are included.

## Windows, Claude Code and live registries — 24 October 2026

Run on Windows 11 with Node **24.19.0** and Claude Code **2.1.306**, on a direct
connection without a proxy. After the fixes below, `npm run check` passed
**35 of 35** tests. `claude plugin validate` passed; its directory profile notes
no `LICENSE` (required for directory submission) and no icon.

### Native Claude Code

Each session loaded the plugin with `claude --plugin-dir` in headless mode. The
`domain-scout` server connected, exposed all three tools and the
`domain-scout:find-domains` skill, and needed no permission beyond those tools.

| Request | Observed workflow |
| --- | --- |
| Five exact domains with quotes | One `check_domains` call; renewal period left unknown; no cause invented for `unavailable` |
| “Find a name for my second brain project.” | `prepare_domain_search` returned `ask_preferences`; the agent asked about style with examples and checked nothing |
| Danish AI news site, prefer `.dk`, mixed first pass | Brief, `domain_sources`, 40 `.dk` candidates, fresh recheck of 7 finalists; shortlist reported as `not_found`, not available. 153 s end to end, mostly `.dk` pacing |
| Fresh `git clone` of the fix commit, no `node_modules` | Server connected from the committed bundle; `.nl` available, `.es` unsupported, `example.com` unavailable |

### Live sources

| Source | Observed result |
| --- | --- |
| Vercel, 20 `.com` names cold | 6,600 ms; `example.com` unavailable, 19 synthetic names available at USD 11.25 for one year; renewal USD 11.25, period not supplied. Repeat: 20 cache hits, 0 ms |
| DNS Belgium DAS (TCP 4343) | `dnsbelgium.be` registered; synthetic `.be` available |
| SWITCH Domain Check (TCP 4343) | `switch.ch`, `nic.li` unavailable; synthetic `.ch`, `.li` available |
| Internetstiftelsen | `iis.se`, `iis.nu` registered; synthetic `.se`, `.nu` available |
| ISNIC | `isnic.is` unavailable; synthetic `.is` available |
| Punktum WHOIS (TCP 43) | `punktum.dk`, `forskning.dk`, `blåbær.dk` registered; synthetic `.dk` `not_found` |
| Catalog RDAP | `denic.de`, `bbc.co.uk` registered; synthetic `.de`, `.co.uk` `not_found` |
| SIDN, after the pacing fix | Five `.nl` names in one batch, all conclusive in 4,487 ms; [registry smoke](live-registry-check-windows.json) clean |

### Defects found and fixed

- **Git installs had no server.** `dist/` and the skill CLI were ignored, so a
  clone could not start MCP. Both are now committed and marked generated.
- **SIDN rejected most of a batch.** Parallel requests, or starts under about a
  second apart, received HTTP 429 without `Retry-After`; 1-second spacing
  succeeded. SIDN now runs one request at a time, 1,100 ms apart.
- **Never-sent lookups read “Request failed”.** Names deferred by the wait
  budget or a cooldown now say the request was not sent.
- **`.es` consumed the wait budget.** `whois.nic.es` timed out after 8 s per name;
  Red.es serves port 43 only to authorised IPs. `.es` is now `unsupported` at once.
- **Routing results swapped `reason` and `evidence`.** Unsupported names now carry
  `no_configured_source` (or `coverage_lookup_failed`) and a readable sentence.

### Installs from GitHub and native Codex

`claude plugin marketplace add ossianravn/domain-scout` followed by
`claude plugin install domain-scout@domain-scout-local`, run against an empty
Claude configuration folder, installed 0.2.0 with `dist/server.cjs` present.

Codex CLI **0.163.0** installed the plugin with
`codex plugin marketplace add ossianravn/domain-scout --ref main` and
`codex plugin add domain-scout@domain-scout-local`. Each `codex exec` run used
`gpt-6-astra` at medium effort in a read-only sandbox; MCP calls ran without
approval prompts.

| Request | Observed workflow |
| --- | --- |
| Five exact domains with quotes | Read the skill, one `check_domains` call, recheck of one rate-limited `.dk` name; quotes reported with their periods |
| Danish AI news site, prefer `.dk` | Brief, six candidates, retry of two rate-limited names, shortlist reported as “no registration record”, not available |
| “Find a name for my second brain project.” | Skill not selected: names suggested without the style question or any check |
| “Use Domain Scout to find a name for my second brain project.” | Skill selected; `prepare_domain_search` returned `ask_preferences` and the agent asked about style |

The `.dk` rate limits came from three Codex sessions running at once, each with
its own server pacing Punktum independently. Results stayed `unknown` with
`rate_limited` until retried.

## Skill rewrite, 0.3.0 — 24 October 2026

The same requests ran headless before and after the rewrite: Claude Code with
`--plugin-dir`, Codex with `gpt-6-astra` at medium effort.

| Request and host | 0.2.0 | 0.3.0 |
| --- | --- | --- |
| "Find a name for my second brain project.", Codex | Skill not selected; names suggested without any check | Skill selected; one style question with unchecked examples |
| Danish AI news site, `.dk`, Claude | First call 40 names, 20 starting "ai"; 10 unresolved when the budget ran out | First call 14 screened names, 3 starting "ai"; shortlist of 5 with a recommendation |
| Danish AI news site, `.dk`, Codex | 6 names; shortlist of 3 | 12 names across four labelled directions; shortlist of 4 |
| Habit app for busy parents, `.com`, Claude | Not run | 37 names (6 available), then 28 names built on what came back open (15 available); shortlist of 7 with prices |
| Habit app for busy parents, `.com`, Codex | Not run | 30 names, 11 available; shortlist of 5 with prices and periods |

Two presentation defects were found in these runs and fixed in the skill: a
check time `02:03:24Z` shown as "03:24" under a UTC heading, and a "taken" line
listing 44 names. Times are now written as hours and minutes UTC from
`checkedAt`, and the taken line stops at ten names.

Punktum rate-limited the first `.dk` call in the Claude run after a day of
repeated test lookups; the agent retried the unresolved names once and resolved
them all.

## DNS screening, 0.4.0 — 24 October 2026

Ideas from the `domain-search-api` reference project were reviewed; DNS
screening was adopted (see [providers](providers.md#dns-screening)), while zone
files, NameSilo, Punktum DAS and all-suffix search were not. `npm run check`
passed **37 of 37** tests, including one boundary test that fails when the
wildcard probe is skipped.

Live checks through the bundled CLI, Cloudflare and Google DNS:

| Check | Observed result |
| --- | --- |
| 10 `.dk` names: 6 registered today, 4 synthetic | 3,167 ms. The 6 registered names, including `blåbær.dk`, returned `likely_taken` from DNS; the 4 synthetic names went to Punktum and returned `not_found` with a `dns_no_delegation` attempt |
| The same 6 registered names with `screen: false` | 5,087 ms; Punktum reported all 6 `registered`, agreeing with DNS |
| `.nl`, `.be`, `.eu` (WHOIS-only) | Registered names `likely_taken`; synthetic `.nl` and `.be` `available` from SIDN and DNS Belgium, synthetic `.eu` `not_found` from WHOIS |
| `.com` | Not screened; Vercel answered as before |
| `DOMAIN_SCOUT_DNS_RESOLVERS` empty, or an `http:` URL | Screening off; configuration error naming the variable |

All 26 `.dk` names Punktum had reported registered in earlier runs that day had
NS records at Cloudflare.

An end-to-end Claude Code run of the Danish request checked 16 names: DNS
ruled out 8, and the agent listed them as taken. It exposed an older routing
defect: when Punktum rate-limited three names and Vercel's extension list then
failed to load, the result became a generic "coverage could not be established"
and hid `rate_limited` and its retry hint. The earlier result now stands, with
the coverage failure kept in `attempts`; an extended routing test fails without
the fix.

## Remaining validation limits

The Claude Code and Codex checks ran headless, not in the interactive UI.
In Codex, a naming request that doesn't mention domains or Domain Scout may not
select the skill; the README tells Codex users to name it.

Generic WHOIS has fixture coverage only: no live host outside the dedicated
services was confirmed. SIDN's limit is an observation from one IP on one day,
not a published quota.

No real Simply token or configured Who-Dat deployment was supplied. Those routes
are fixture-tested. The optional Who-Dat Docker example is version/digest pinned,
but no service was deployed. A broad IANA WHOIS route is not a claim that the
conservative parser recognizes every registry dialect.
