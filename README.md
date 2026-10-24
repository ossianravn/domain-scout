# Domain Scout

**Creative domain discovery for Codex and Claude Code.**

Domain Scout combines a shared agent skill with a local MCP server. The agent
understands the project, asks for missing naming preferences with examples,
creates candidates, and uses the server to check exact domains in batches.
It uses the model already running in your agent; no separate model API key is
required. Default lookup sources also work without an API key.

Version **0.2.0**. Requires **Node.js 22+**. The release includes runnable bundles
and complete TypeScript source. Installing the release does not require npm.

## Install

Extract the complete archive to a stable folder named `domain-scout`.
Replace the example path below with that folder's absolute path.

### Codex

```sh
codex plugin marketplace add /absolute/path/domain-scout
codex plugin add domain-scout@domain-scout-local
```

Start a new Codex session and select `find-domains`, or ask to use Domain Scout.

### Claude Code

Try it in one session:

```sh
claude --plugin-dir /absolute/path/domain-scout
```

Run `/domain-scout:find-domains`. For a persistent installation:

```sh
claude plugin marketplace add /absolute/path/domain-scout
claude plugin install domain-scout@domain-scout-local
```

See [the installation guide](docs/install.md) for Windows, WSL, credentials,
updates, and troubleshooting. This package targets local agent runtimes;
browser-only clients need a separately hosted remote MCP deployment.

## Try these requests

- “Find the shortest attractive domain for a short URL service.”
- “Find a name for my second brain project. Explore metaphorical and invented names.”
- “Find a domain for a teaching app that helps teachers prepare lessons.”
- “Find a Danish domain for an AI news site. Prefer `.dk` and a credible editorial tone.”
- “Check these exact domains and show any registration and renewal quotes.”

For an open naming request, the skill first asks about an unresolved style:
descriptive/exact, suggestive/close, metaphorical, playful, invented, across the
dot, or a mixture. It reuses preferences already given. Direct availability
checks proceed immediately.

## What is implemented

| Component | Purpose |
| --- | --- |
| `prepare_domain_search` | Structured naming brief, illustrated preference questions, semantic directions, and optional short-name pages |
| `check_domains` | Batched lookups, source routing, evidence, prices, caching, and a configurable wait budget |
| `domain_sources` | Local catalog counts, published routes for requested extensions, configured sources, and explicit metadata refresh |
| `find_domains` MCP prompt | Starts the workflow in clients that expose MCP prompts |
| `find-domains` agent skill | Creative generation, clarification, ranking, feedback, and final verification |
| Bundled CLI | The same prepare/check/sources operations when shell access is available |

The naming directions cover short links, second brains, teaching, AI news, and
general projects. The host agent adapts those directions to the actual audience
and language. No rigid list of generated brand names replaces that judgment.

For shortest-domain requests, C/V/L/D patterns generate a finite, paginated
search space. Candidates are ordered by the **complete ASCII hostname length**,
including dots and suffixes. Overlapping patterns are deduplicated. A cursor
can resume very large spaces without enumerating earlier names. Pages remain
unverified until checked. See [naming behavior](docs/naming.md).

## Lookup sources and evidence

| Source | Main use | Access |
| --- | --- | --- |
| Vercel Registrar API | Availability and quoted prices on supported extensions; batches up to 200 | Public, no key |
| ISNIC DAC | `.is` registration availability | Public, no key |
| Internetstiftelsen Free | `.se` and `.nu` availability | Public, no key |
| Punktum WHOIS | `.dk` registration records and waiting-list status | Public TCP 43, no key |
| DNS Belgium DAS | `.be` registration availability | Public TCP 4343, no key |
| SWITCH Domain Check | `.ch` and `.li` registration availability | Public TCP 4343, no key |
| SIDN RDAP | `.nl` explicit free status or unavailable evidence | Public, no key |
| Catalog-routed RDAP | Registration / no-record evidence with alternate endpoints | Public, no key |
| Catalog-routed WHOIS | Conservative fallback across published registry routes | Public TCP 43, no key |
| Simply | Optional `.dk` registrar confirmation | `SIMPLY_API_KEY` or `SIMPLY_API_TOKEN` |
| Who-Dat | Optional self-hosted RDAP/WHOIS bridge | Owner-provided HTTP(S) endpoint; optional token |

The bundled catalog projects routing fields from [IANA's full TLD registry](https://www.iana.org/domains/root/files).
The 23 October 2026 snapshot has **1,437 active root records**, **1,207 with RDAP
routes** after official `.de`/`.ch`/`.li` supplements, **871 with WHOIS routes**,
and **1,367 with at least one route**. These counts describe published metadata;
they do not measure live service success, parser coverage or open registration.
Some published WHOIS routes are intentionally excluded from generic checks.

`domain_sources` reads this catalog immediately without a network request.
Supply `tlds` to inspect particular extensions; `refresh: true` explicitly
refreshes IANA metadata for the running process and retains the previous data
if refresh fails. It does not probe the listed services. See [catalog details](docs/catalog.md).

Provider coverage is checked before interpreting results. In particular, an
unsupported suffix cannot become “unavailable” just because a registrar returns
false. Generic RDAP and WHOIS no-record results remain
`not_found`; they are not claimed available for purchase.

The seven states are `available`, `registered`, `unavailable`, `not_found`,
`unsupported`, `unknown`, and `invalid`. Each result retains its source and check
time. Prices retain currency and quoted periods. Unknown renewal periods remain
unknown. The plugin does not buy domains or search aftermarket listings.

See [provider behavior and official references](docs/providers.md) for source
limits, routing order and interpretation. The [research review](docs/research-review.md)
explains the additions adopted for 0.2 and why DNS/CZDS screening remains a
possible hosted-service extension.

To bridge a network that cannot reach WHOIS, configure your own Who-Dat service
with `DOMAIN_SCOUT_WHO_DAT_URL`. Its negative boolean result remains `unknown`;
it does not establish availability. Setup, upstream cache behavior and a pinned
Docker Compose example are in [the Who-Dat guide](docs/who-dat.md).

## Speed and controls

The server batches supported names, runs independent sources concurrently,
coalesces identical in-progress work, and caches evidence for 60 seconds.
Generic RDAP and WHOIS queues are separated by upstream host; RDAP can try
alternate published URLs after unresolved failures. `fresh: true` bypasses the
plugin's result cache when rechecking finalists. It cannot bypass a remote
service's own cache. Unknown results are not cached.

`check_domains` has a **10-second default wait budget**. It returns completed
results and marks unfinished names `unknown` with `time_budget_exhausted`.
Pass `maxWaitMs` to change the budget. Already active requests may finish and
populate the cache; queued requests do not start after their deadline.

This matters for `.dk`: public WHOIS requests are spaced one second apart.
The optional Simply adapter offers registrar confirmation without using that
WHOIS path. All upstream limits and `Retry-After` instructions still apply.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `DOMAIN_SCOUT_TIMEOUT_MS` | 8000 | Each network request's timeout |
| `DOMAIN_SCOUT_CACHE_TTL_MS` | 60000 | Cache duration; zero disables caching |
| `DOMAIN_SCOUT_MAX_WAIT_MS` | 10000 | Default whole-call wait budget |
| `DOMAIN_SCOUT_WHOIS_INTERVAL_MS` | 1000 | Local spacing between generic WHOIS starts on the same host |
| `SIMPLY_API_KEY` / `SIMPLY_API_TOKEN` | Unset | Optional `.dk` registrar credential |
| `DOMAIN_SCOUT_WHO_DAT_URL` | Unset | Optional owner-provided Who-Dat base URL |
| `DOMAIN_SCOUT_WHO_DAT_TOKEN` | Unset | Optional Bearer token for that service |

The process inherits these variables. `.env` files are not implicitly loaded.
Only queried domains go to lookup sources; the naming brief stays with the host.

## CLI and development

```sh
node dist/cli.cjs prepare '{"project":"A second brain app","namingStyles":["mixed"]}'
node dist/cli.cjs check '{"domains":["example.com"],"fresh":true}'
node dist/cli.cjs sources '{"tlds":["dk","com","de","ch","nl"]}'
```

Omit the JSON argument, or use `-`, to read it from stdin. For development:

```sh
npm ci
npm run check
npm run smoke
```

`check` typechecks, builds, and runs offline acceptance tests. `smoke` explicitly
contacts public providers. The build refreshes the MCP bundle, CLI bundle,
skill fallback, and bundled dependency notices. Generated bundles are the only
large source-like files; authored modules stay below 300 lines.
Run `npm run update:registry` and rebuild to embed a newer IANA routing snapshot.

See [validation results](docs/validation.md) for what was actually tested and
what still requires validation in a native client or with credentials.
