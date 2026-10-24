# Registry data and implementation references

## Bundled routing snapshot

`src/data/registry-snapshot.json` projects routing fields from IANA's public
Top Level Domain Registry data. It retains active suffix, type, RDAP base URLs,
WHOIS host, generation time and source URL. It does not retain registry contacts.

- Publisher: Internet Assigned Numbers Authority / Public Technical Identifiers.
- Source: https://data.iana.org/TLD/v1/tlds.json
- Description and download: https://www.iana.org/domains/root/files
- Snapshot generated: 2026-10-23T22:54:03+00:00.
- Refresh command: `npm run update:registry`, followed by `npm run build`.

This attribution does not relabel the root registry data as CC0, MIT or another
license. The separately bundled JavaScript dependency licenses do not extend
to external registry data or third-party services.

Three explicit official RDAP supplements are maintained in `registry-catalog.ts`:

- DENIC `.de`: https://www.denic.de/en/rdap-master/
- SWITCH `.ch` and `.li`: https://www.nic.ch/whois/rdap/

## Protocol and open-source references

WHOIS parsing and query behavior were informed by official registry protocol
examples and public fixtures. The conservative classifier is original code;
no upstream parser implementation or wholesale fixture dataset is vendored.

- Whoiser (MIT): https://github.com/LayeredStudio/whoiser
- domain-check (MIT OR Apache-2.0): https://github.com/saidutt46/domain-check
- Likexian whois-parser (Apache-2.0): https://github.com/likexian/whois-parser
- OpenRDAP (MIT), a reference client: https://github.com/openrdap/rdap

Who-Dat is an optional separately deployed service, not bundled executable code:
https://github.com/lissy93/who-dat (MIT). Its deployment guide pins a release and
container digest. The adapter preserves its upstream observation age and does
not treat a negative registration flag as proof of purchasability.

ZoneDB was evaluated as a supplementary catalog. Its code is MIT and its data
is ODbL; the dataset is not included in this release. See https://github.com/zonedb/zonedb.

The source-specific API references and interpretation rules are listed in
`docs/providers.md`; the uploaded research assessment is `docs/research-review.md`.
