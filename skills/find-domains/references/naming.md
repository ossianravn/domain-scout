# Naming techniques

Directions say *what* a name means; constructions say *how* it is built. A
good wave varies both. Example names below illustrate a construction; none of
them has been checked.

## Constructions

| Construction | How | Example | Watch for |
| --- | --- | --- | --- |
| Descriptive | Category plus qualifier | LessonPlanner | Usually registered on `.com`; clearer on a local ending |
| Benefit compound | Outcome plus object | RecallNest | Two nouns that sound like a stock-photo caption |
| Borrowed word | One real word with a fitting association | Lantern | Bare dictionary words on `.com` are nearly always taken; pair with a short word or another ending |
| Altered word | Drop, swap or add a letter or ending | Tidly | Must still pass "heard once, typed right" |
| Blend | Two roots fused at a shared sound | Pin + interest | The join must read one way |
| Coinage | A new pronounceable word, often two or three syllables | Veluno | Should hint at a feeling, not just sound random |
| Phrase across the dot | Label and ending read as one phrase | husk.at | The ending must be open to the public and fit the market |
| Modifier on a fixed brand | get-, try-, use-, -app, -hq | getlantern.com | A fallback when the brand is decided and the bare name is taken; say so |

For "a mix", take at least one direction through three or more constructions.
For a single style, vary the direction instead.

## Language and market

- Write names the target audience would say. A Danish news site needs Danish
  newspaper instincts (*Tidende*, *-posten*), not English puns.
- Danish æ, ø and å make an internationalized domain (`xn--…`), which is
  longer in ASCII and harder to type abroad. Offer the ae/oe/aa spelling too,
  and check both when both would be used.
- Check what a name means in English as well as the target language.
- Local endings (`.dk`, `.se`, `.nl`) carry trust at home and often have more
  open short words than `.com`.

## Reading a wave's results

- Mostly taken: the construction is crowded. Move to compounds, altered words
  or coinages, or to an accepted alternative ending, rather than more of the
  same.
- Mostly open but weak: the screen was too loose. Tighten it before the next
  wave instead of checking more.
- A favorite is taken: check two or three close neighbours (a modifier, the
  other spelling, an accepted alternative ending) and say what each change
  costs in meaning.

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
