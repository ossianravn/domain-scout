# Review of the supplied domain-search architecture

Reviewed **24 October 2026** against the full supplied `dom-eng.md`, including
its Python example and references. This compares the original 0.1 plugin with
the completed 0.2 implementation; the release validation report remains the record
of what has actually passed tests or worked against live services.

The useful addition is a broader, more resilient lookup layer: a registry
catalog, WHOIS fallback, alternate RDAP endpoints, and scheduling by upstream
host. Those fit the plugin directly. The document contributes less to the
creative naming workflow, which already covers assumption checks, examples,
semantic directions, Danish naming, and paginated short-domain generation.
Several availability rules in the document would reduce the accuracy of 0.1
and need correction before adoption.

## Adopt or retain

| Idea from the document | Original 0.1 | Decision for 0.2 |
| --- | --- | --- |
| Separate namespace discovery from lookup | Public Suffix List parsing plus a fetched IANA RDAP bootstrap | Add the bundled, refreshable IANA full registry catalog. Routing is immediately usable without a startup download. Retain the previous catalog when refresh fails. |
| Multi-label suffixes and IDNs | Already uses `tldts`, excludes private suffix rules, and normalizes ASCII/Unicode names | Retain it. A suffix boundary helps parse names; it does not prove that a particular customer may register them. [PSL guidance][psl] makes this distinction important. |
| More than one RDAP URL | The fallback selected one bootstrap URL | Retain all supplied URLs and try alternatives after unresolved failures, within the caller's deadline. [RFC 9224][bootstrap] supports multiple service URLs and label-wise longest matching. |
| Broad WHOIS fallback | Dedicated Punktum `.dk` WHOIS only | Add catalog-routed WHOIS with a small set of known query dialects and conservative interpretation. Unknown formats stay unknown. Avoid inventing `whois.nic.<tld>` endpoints. |
| Per-host concurrency and pacing | Queues were primarily per provider | Partition generic RDAP/WHOIS scheduling by actual endpoint host, preserving published pacing and `Retry-After`. A slow registry should not occupy another registry's queue. |
| Explicit availability rather than directory inference | Vercel, ISNIC, IIS and optional Simply already supply stronger availability signals | Extend dedicated coverage with Belgium DAS, SWITCH Domain Check for `.ch`/`.li`, and SIDN-specific `.nl` interpretation. These are more useful for the purchase decision than another generic parser. |
| Reuse open-source lookup software | Small local adapters | Offer an optional self-hosted Who-Dat connector. It provides another transport path to registries, not an independent registry database. Preserve upstream cache age and conservative negative-result handling; see [Who-Dat integration](who-dat.md). |
| Preserve evidence and partial results | Seven result states, timestamps, caching, deduplication and a whole-call budget already exist | Keep these. The document's single availability boolean loses distinctions the plugin already preserves. |

The measured catalog contains **1,437 active root records**, with RDAP routes
for **1,207**, WHOIS routes for **871**, and at least one route for **1,367** after
the verified `.de`/`.ch`/`.li` additions. These are routing counts, not counts of
tested working services or publicly registrable extensions. The source is
[IANA's full TLD registry][iana]; [catalog.md](catalog.md) records the snapshot
date, projection, attribution and refresh procedure.

The new dedicated adapters follow the registries' own contracts:
[Belgium DAS][belgium] explicitly reports availability and publishes 50 queries
per minute per IP; [SWITCH Domain Check][switch-check] has stable numeric
registration-availability codes; [SIDN's manual][sidn] defines `.nl` domain
responses separately from general RDAP semantics. The SIDN adapter requires a
matching domain object with explicit `free` status before promoting its 404
response to `available`.

## Correct before using the design

1. **DNS failure must never become `available: true`.** The document first
   explains why NXDOMAIN does not establish availability, then its terminal
   fallback does exactly that. The Python code goes further: timeout, SERVFAIL
   and NXDOMAIN all become the same ambiguous value, which the terminal branch
   can turn into `true`. Keep `unknown` when registry checks fail. Registered
   domains on `clientHold` can intentionally have no DNS resolution, as
   [ICANN documents][epp]. A low-confidence label cannot repair a wrong boolean.

2. **Generic RDAP 404 means no matching directory result, not purchasable.**
   [RFC 7480][rdap-http] describes an empty result set. SWITCH explicitly says
   that its [404 does not always mean the name can be registered][switch-rdap].
   Preserve `not_found`; only a documented registry-specific availability
   response or registrar result can become `available`. The document's later
   discussion of reserved names contradicts its earlier universal-404 rule.
   Its proposed `available_in_registry` wording would still overstate evidence.

3. **HTTP 200 needs matching domain evidence.** A successful HTTP response,
   arbitrary JSON, or a generic status marker is insufficient. Validate a
   [domain object and its name][rdap-json] against the exact query, including
   supplied ASCII/Unicode identities. Preserve withheld/reserved outcomes.
   SIDN explicitly documents cases where 200 represents an excluded name,
   so universal `200 = registered` is also too strong. [SIDN manual][sidn]

4. **WHOIS no-match is not a universal availability protocol.**
   [RFC 3912][whois] defines text transport, not a standardized purchase verdict.
   Use recognized registry-specific negative responses as `not_found` unless
   that registry explicitly defines stronger semantics. Require matching name
   evidence for positive records. An unanchored `does not exist` expression or
   a stray `nserver:` field is insufficient. Retain rate-limit/error detection
   and reject contradictory or unrecognized responses.

5. **`.dk --show-handles` is unnecessary for this task.**
   [Punktum's specification][punktum] shows that an ordinary domain query already
   includes the name, registration date and status. The flag adds registrant
   information. Keep the current `whois.punktum.dk` route and UTF-8 query rather
   than copying the document's older hostname and extra lookup option.

6. **Absence from IANA RDAP bootstrap does not prove no public RDAP exists.**
   The repeated `.de` example is outdated: [DENIC publishes a public pilot RDAP
   service][denic]. SWITCH also documents public `.ch`/`.li` RDAP. Add verified
   official supplements with provenance and distinguish pilot operation from
   a service-level guarantee.

7. **A Bloom-filter hit cannot be final `taken` evidence.** Bloom filters admit
   false positives; [Redis's technical documentation][bloom] states this
   directly. An exact zone-set hit avoids that probabilistic error but still
   records delegation at the snapshot time. A later deletion can make it stale.
   Use either as a dated screening hint; confirm shortlisted names against a
   current registry or registrar source. Absence from a zone is never a
   registration-availability result.

8. **“500 domains in five seconds” is not this plugin's benchmark.** The
   document cites another project's reported result without a comparable TLD
   mix, cache state, endpoint quotas, error rate or proportion of final answers.
   Measure cold/warm latency and completed versus unresolved results on a stated
   workload. Keep the configurable whole-call budget and partial results; do not
   equate returning quickly with completing every registry check.

## Python example: useful sketch, incomplete implementation

The example illustrates the intended fallback sequence, but four gaps matter
if it is treated as production code:

- `parts[-1]` identifies the root label but does not implement the promised PSL
  validation. The code does not establish whether the input is a registrable
  domain, a public suffix, or a deeper subdomain. Keep the plugin's existing
  normalization and suffix parsing rather than translating this function.
- A semaphore limits simultaneous requests, not their rate. The RDAP semaphore
  is keyed by the complete base URL, so two paths on one host can get separate
  pools. The example has no token bucket or `Retry-After` handling despite
  promising both in the surrounding text. [RFC 7480][rdap-http] calls for reduced
  query rates and respecting a supplied retry interval.
- Per-step timeouts do not create a whole-search deadline. Several RDAP
  alternatives, IANA discovery and WHOIS can accumulate latency; each WHOIS
  chunk resets the read timeout. Apply the remaining shared budget to scheduling
  and active I/O, and stop starting fallback work after expiry.
- The wildcard probe treats DNS errors as proof that no wildcard exists, and
  its cache has no expiration despite the stated 24-hour TTL. A random label
  is also only very unlikely to be registered. Any future DNS screening needs
  explicit inconclusive states, actual expiry, and suffix-appropriate probes.

## Defer to an optional hosted API

**CZDS ingestion and local DNS infrastructure:** potentially valuable when a
long-running service repeatedly searches large overlapping name sets. CZDS
requires an account and access to participating zones, followed by downloading,
parsing, storing and refreshing snapshots; [ICANN describes that access
model][czds]. A local interactive plugin otherwise gains background services,
storage and startup work before the user has selected a naming direction.
The benefit should first be measured against batched registrar checks and
small, ranked candidate waves. Do not make CZDS a plugin installation dependency.

**DNS-first screening:** optional for that same hosted workload. It adds a
lookup, plus wildcard discovery when uncached, before authoritative checking.
Novel creative candidates often still need that authoritative request, so the
extra stage is not automatically faster. If adopted, expose dated delegation
evidence separately and never promote negative DNS evidence to availability.

**More elaborate failure machinery:** a shared cross-process quota store,
background retry queues and tuned outage circuit breakers can help a hosted
service. The document's three-failures/60-seconds/120-second settings are design
suggestions, not registry contracts. Start with endpoint isolation, documented
pacing, retry intervals, alternate routes and the existing deadline; tune
additional machinery from observed failures.

**More libraries and deeper referrals:** WHOIS/RDAP projects are useful parser
references or replaceable services. Adding Go, Rust and Python runtimes to a
Node plugin does not itself increase authoritative coverage. Full registrar
contact/expiration traversal is unnecessary for the current availability
workflow. Existing Vercel pricing and optional Simply confirmation already
provide a path beyond public-directory evidence.

The 0.2 acceptance tests verify that an unavailable registry leaves unrelated
hosts responsive, alternate routes respect the same deadline, and ambiguous
responses preserve `unknown` or `not_found`. The validation report separates
catalog coverage, fixture coverage and live successful lookups.

[iana]: https://www.iana.org/domains/root/files
[psl]: https://publicsuffix.org/learn/
[bootstrap]: https://www.rfc-editor.org/rfc/rfc9224.html
[rdap-http]: https://www.rfc-editor.org/rfc/rfc7480.html
[rdap-json]: https://www.rfc-editor.org/rfc/rfc9083.html#section-5.3
[whois]: https://www.rfc-editor.org/rfc/rfc3912.html
[epp]: https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en
[punktum]: https://github.com/Punktum-dk/whois-service-specification
[denic]: https://www.denic.de/en/rdap-master/
[belgium]: https://docs.dnsbelgium.be/be/general/whoisanddas.html
[switch-check]: https://www.nic.ch/whois/domaincheck/
[switch-rdap]: https://www.nic.ch/whois/rdap/
[sidn]: https://www.sidn.nl/downloads/1l3dvAfH8Ppqnjl0Y7p0jL/7f4d9399e83188bf6f68f68af9179d10/RDAP_Manual_v1.4.pdf
[bloom]: https://redis.io/docs/latest/develop/data-types/probabilistic/bloom-filter/
[czds]: https://czds.icann.org/help
