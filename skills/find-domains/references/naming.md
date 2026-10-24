# Naming workflow

The host model supplies linguistic judgment and creativity. The server returns
a structured brief, generation guidance, and exact lookup evidence.

## Brief

Call `prepare_domain_search` with the project and preferences already supplied
in the conversation. Its primary questions cover missing naming direction and
material product ambiguity. Optional questions identify language, endings,
budget, and acquisition preferences. Ask them when an answer changes the search;
the user may choose a mixed first pass.

Style examples illustrate the difference between descriptive, suggestive,
metaphorical, playful, invented, and domain-phrase naming. Their availability
is untested. Adapt examples to the user's language and project.

Generate independent conceptual directions before close spelling variants.
For a second brain, capture, recall, connection, rediscovery, cultivation, and
personal space each express a different product benefit. Preserve the direction
and a short rationale with candidates so feedback can refine the next wave.

Check exact domains in batches. Present a concise shortlist with naming fit,
availability evidence, source, timestamp, and quoted pricing periods. Retain
favorites, rejected directions, and already checked domains in conversation.

## Short-domain generation

Pass an explicit `shortSearch` object to `prepare_domain_search`:

```json
{
  "project": "A short URL service",
  "namingStyles": ["mixed"],
  "priority": "shortest",
  "shortSearch": {
    "patterns": ["CV", "VC", "CVC"],
    "tlds": ["to", "com"],
    "pageSize": 60
  }
}
```

Pattern letters mean:

| Symbol | Alphabet |
| --- | --- |
| C | English consonants, including y |
| V | a, e, i, o, u |
| L | English letters a–z |
| D | Digits 0–9 |

The generator orders candidates by complete ASCII hostname length, suffix, and
label. It applies DNS syntax limits and removes overlap between patterns.
Internationalized suffixes are converted to ASCII for the length comparison.
Lookup providers establish suffix coverage and registry-specific eligibility.

Use the returned `nextCursor` with the same patterns, suffixes, and exclusion
list to continue. `pageSize` can change between pages. The page size defaults
to 60 and is configurable; it is a delivery size, not a search quota. The
opaque cursor preserves position without storing a server-side search session.

`exclude` accepts exact domains already checked or rejected. Changing the
exclusions changes the search space; start without a cursor after that change.
`totalPatternSpace` counts the distinct pattern space before exclusions;
`traversed` records the pagination position. Both are decimal strings so large
finite spaces remain exact. Every generated candidate has unverified availability.

Choose attractive candidates from the page and call `check_domains` separately.
Compare shortest, most pronounceable, strongest brand, and best price as useful
tradeoffs. Only claim an exhaustive shortest result when the agreed search scope
and checks support that claim.
