---
name: find-domains
description: Find attractive domain names and check registration availability with Domain Scout. Use for project or product naming, exact domain checks, short URL domains, second brain projects, teaching apps, Danish .dk names, AI news sites, and iterative brand discovery. Clarify missing naming preferences with examples, generate creative candidates using the host agent, and verify exact names in fast batches.
---

# Domain Scout

Use the host agent for creative judgment and Domain Scout for deterministic search
and live evidence. Reuse preferences already established in the conversation.

## Start with the right brief

For an explicit list of domains to check, call `check_domains` directly.
For a naming request, call `prepare_domain_search` with the project and known
preferences. Read [references/tools.md](references/tools.md) for tool inputs,
result states, and the bundled command-line fallback.

If the naming style is missing, ask one compact question before checking names.
Offer examples relevant to the user's project. Make clear that these examples
illustrate style and have untested availability. For a second brain project:

| Direction | Illustrative name | What it emphasizes |
| --- | --- | --- |
| Descriptive or exact | SecondBrainNotes | The product category |
| Suggestive or close | RecallNest | A recognizable benefit |
| Metaphorical | Lantern | An association with finding ideas |
| Playful | BrainCrumb | Personality and memorability |
| Invented | Veluno | A distinctive pronounceable identity |
| Across the dot | husk.at | A phrase using the domain ending |

Include “a mixture” as a valid answer. Ask about the audience when the use case
is ambiguous, such as teaching tools for teachers versus learning apps for
students. Ask what an undefined project like “xyz” actually does.

Carry forward stated language, market, suffix, budget, and length preferences.
Distinguish required endings from preferred ones. Resolve additional questions
only when they materially change the search. If the user asks for a mixed first
pass, proceed and state working assumptions. Keep unspecified budgets and
premium preferences open; do not invent spending limits or hard exclusions.

For very short names, clarify ordinary registration versus premium or resale
possibilities when that tradeoff matters. The bundled providers check new
registrations; they do not search aftermarket listings.

## Generate a useful range

Use the directions from `prepare_domain_search` as starting points. Create names
from the user's desired outcome, the actions people take, and several different
metaphors. Explore real words, natural compounds, compact coinages, and phrases
across the dot when they fit the chosen style. Attach a brief rationale and a
semantic direction to each candidate so feedback can improve the next wave.

Read [references/naming.md](references/naming.md) when choosing directions or
building a short-domain search. Adapt the examples to the actual project and
language. For Danish requests, consider Danish phrasing, local pronunciation,
and whether æ, ø, or å add meaning. Show the Unicode name and ASCII form when
relevant; compare wire length using ASCII. Do not turn an IDN into a supposedly
shorter link by counting only its displayed letters.

Evaluate pronunciation, ease of retyping, visual ambiguity, meaning, and fit
with the user's audience. Keep uncertainty about unfamiliar meanings visible.
Availability alone does not establish brand or trademark clearance; do not
claim such checks unless they were separately performed.

Generate a diverse wave and send exact domains together in `check_domains`.
Use the host's existing model; do not request a separate model API key or make
an extra model call through the MCP server.

## Check quickly and preserve evidence

Use `domain_sources` when choosing less common extensions or explaining coverage.
It reads a local catalog immediately; `refresh: true` explicitly updates IANA
routing metadata. A published route does not prove a working service or open
registration, and a brand-only or restricted suffix may not fit the user.

Batch candidates in one tool call. Let the server choose supported sources,
coalesce duplicate checks, and respect source limits. The default whole-call
wait budget is ten seconds; `maxWaitMs` can change it. For a rapid first pass,
use a shorter budget such as 3000 ms and continue with unresolved names. If the response marks
names `time_budget_exhausted`, return the useful completed results and continue
only with unresolved candidates when worthwhile. Increase the budget when the
user prefers a more complete slow-source search.

Keep these distinctions intact:

- `available`: the named source explicitly reports registrability at the check time.
- `registered`: a matching registration record exists.
- `unavailable`: the source reports registration unavailable; do not invent the cause.
- `not_found`: no record was found; registrability still needs confirmation.
- `unsupported`: no configured source covers the name.
- `unknown`: a failed, incomplete, rate-limited, or unfinished lookup.
- `invalid`: the input is not a registrable domain in the accepted syntax.

Never infer availability from DNS, an HTTP error, or a generic RDAP 404.
For `.dk`, public WHOIS is slow and a no-record result remains `not_found`.
A configured Simply token provides a registrar check for `.dk`. Report failed
connectivity plainly; do not fill gaps with invented evidence.
Generic WHOIS fallbacks also preserve no-record results as `not_found`.
Dedicated registry services can report stronger availability evidence.

Preserve source, `checkedAt`, quoted currency, premium status, and registration
and renewal periods. Unknown periods stay unknown. Compare a user's budget
only to compatible quotes; a two-year price is not an annual price. Do not
assume a registrar's price is the cheapest available price.
If a proxy supplies `observedAt` or `upstreamCached`, show that older observation
separately. `fresh: true` bypasses this plugin's cache, not an upstream cache.

## Search for the shortest attractive name

Agree on acceptable suffixes and naming patterns. Ask `prepare_domain_search`
for a `shortSearch` page using C (consonant), V (vowel), L (letter), and D (digit).
For example, use patterns `CV`, `VC`, and `CVC` on suffixes the user accepts.
The generator sorts by the full ASCII hostname, including dots and suffixes,
and deduplicates overlapping patterns. Generated strings are still unverified.

Select attractive candidates, then check their availability. Resume with the
returned cursor and the same patterns, suffixes, and exclusions. Page size may
change. Keep the cursor scope's exclusion list fixed; use a separate record of
newly checked domains to avoid redundant checks. Start a new scope if the user
changes the allowed patterns, endings, or exclusions.

Compare the shortest result with slightly longer options that are easier to say,
spell, or renew. State “shortest found within the explored scope.” Claim a
minimum only if every shorter eligible candidate in the agreed finite scope
has conclusive evidence. Do not imply that a few attractive examples exhaust
all names or every registry's special eligibility rules.

## Refine and present

Use favorites and rejected directions to make the next wave more focused.
Avoid repeating checked candidates unless their evidence needs refreshing.
When a requested exact match is unavailable, explore the user's chosen adjacent
styles and explain the useful change in meaning.

Present a compact shortlist with the domain, why it fits, availability state,
source and check time, any quoted price and renewal terms, and length when
relevant. Separate unresolved prospects from verified available options.
Explain the strongest tradeoffs and recommend based on the user's priorities.
Recheck finalists with `fresh: true` before the user acts. Treat the result as a
time-stamped observation; registration is a separate user action.
