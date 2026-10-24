# Registry routing catalog

Domain Scout embeds a compact snapshot of IANA's official TLD Registry Data.
The catalog resolves domains to registry endpoints immediately, including when
the metadata service is temporarily unavailable. Domain lookup results still
come from the registry or registrar selected for that query.

## Current measured coverage

The IANA source was generated on **23 October 2026 at 22:54:03 UTC** and fetched
on **24 October 2026**. It contains 1,603 records: 1,437 active, 153 retired,
eight reserved, and five eligible. The active set exactly matched IANA's
separate list of delegated root TLDs at the time of measurement.

| Measure | IANA snapshot | With verified RDAP supplements |
| --- | ---: | ---: |
| Active root TLDs | 1,437 | 1,437 |
| TLDs with RDAP routes | 1,204 | 1,207 |
| TLDs with WHOIS routes | 871 | 871 |
| TLDs with either protocol | 1,367 | 1,367 |
| TLDs with neither route in this catalog | 70 | 70 |

The protocol columns overlap. A route means an endpoint is published for the
TLD. Live success depends on its current operation, supported query syntax,
network access, and rate limits. Registration eligibility and prices come from
the result of an actual query. Some active TLDs serve restricted communities
or individual brands.

The catalog contains active suffix, type, RDAP URLs, and optional WHOIS server.
It omits registry contact records and all retired/reserved/eligible entries.
Domain normalization and public-suffix handling remain separate responsibilities.

## Official supplements

The following registry-published RDAP services fill gaps in IANA's current
RDAP routing fields. Their existing WHOIS routes explain why the total number
of routed TLDs stays the same.

| Suffix | RDAP base | Official documentation |
| --- | --- | --- |
| `.de` | `https://rdap.denic.de/` | [DENIC RDAP](https://www.denic.de/en/rdap-master/) |
| `.ch` | `https://rdap.nic.ch/` | [SWITCH RDAP](https://www.nic.ch/whois/rdap/) |
| `.li` | `https://rdap.nic.ch/` | [SWITCH RDAP](https://www.nic.ch/whois/rdap/) |

Supplement URLs are recorded separately in `src/registry-catalog.ts`. The
catalog retains all published RDAP bases, allowing providers to attempt
alternate endpoints when necessary. It resolves the most specific matching
suffix, so injected or future multi-label routes can take precedence.

## Refresh and rebuild

The runtime catalog has an explicit refresh operation. It fetches the official
JSON once for concurrent refresh requests, validates its routing fields, and
replaces the in-memory snapshot only after successful parsing. A failed request
or malformed document returns an explicit retained outcome and keeps the
previous routes usable. Construction and lookups perform no network requests.

To update the bundled snapshot from the project root:

```sh
node --import tsx scripts/update-registry.mjs
npm run build
```

For a previously downloaded copy of the same official JSON, pass its path as
the final argument. The generator uses the same parser as the runtime refresh
and reports the resulting counts. The generated JSON is embedded in the
release bundles; ordinary installations require no separate data download.

## Sources and attribution

- [IANA Root Files](https://www.iana.org/domains/root/files) describes the
  machine-readable registry and the delegated-TLD list.
- [TLD Registry Data](https://data.iana.org/TLD/v1/tlds.json) is the source of
  the bundled factual routing fields.
- [JSON schema](https://data.iana.org/TLD/v1/tlds-schema.json) describes the
  upstream document.
- [Delegated TLD list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) was
  used to independently check the active root count.
- [RDAP bootstrap](https://data.iana.org/rdap/dns.json) independently matched
  the snapshot's 1,204 RDAP-covered TLDs.

Source URL and generation time are retained with the derived snapshot.
IANA's [protocol-registry licensing statement](https://www.iana.org/help/licensing-terms)
specifies CC0 for protocol registries within its stated scope; this catalog
does not extend that claim to unrelated IANA material.

ZoneDB and the rfc1036 WHOIS client were also evaluated. ZoneDB's code is MIT
and its data is ODbL-1.0; rfc1036/whois is GPL-2.0-or-later. No data or code from
those projects is incorporated into this catalog. IANA's current full registry
provided broader route coverage and fresher endpoints in this comparison.
