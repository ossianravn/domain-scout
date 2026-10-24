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

## Remaining validation limits

Native installation inside the Codex and Claude Code interfaces was not performed.
Codex command syntax was checked against installed CLI help during 0.1.0 work;
Claude Code was not installed here. Isolated stdio tests verify the launch
configurations and MCP behavior, not every native client UI flow.

Direct TCP registry connections were not reachable from this environment.
Punktum WHOIS, generic WHOIS, Belgium DAS and SWITCH Domain Check have fixture
coverage; live target-host connectivity is still required. The documented IIS
HTTP endpoint also failed in this Node/proxy environment. Its free, occupied,
mismatched and HTML cases have fixture coverage.

SIDN's explicit free response format was inspected during provider research and
is exercised by fixtures. The final live run encountered rate limiting and a
timeout, so it does not certify dependable bulk throughput for that service.

No real Simply token or configured Who-Dat deployment was supplied. Those routes
are fixture-tested. The optional Who-Dat Docker example is version/digest pinned,
but no service was deployed. A broad IANA WHOIS route is not a claim that the
conservative parser recognizes every registry dialect.
