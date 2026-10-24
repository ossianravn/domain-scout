# Domain Scout

Build a portable Codex and Claude plugin that helps people find appealing,
available domain names quickly. The host model supplies taste and creativity;
the MCP server supplies source-backed lookup results and comparable prices.

- Keep source and test code files at or below 300 lines. Split by responsibility.
- Preserve evidence: provider coverage, registration records, registrability,
  pricing, and failed lookups are separate facts.
- Use documented public APIs. Honor upstream limits and Retry-After.
- Keep provider credentials in environment variables and out of responses.
- Use focused integration/acceptance checks for complete workflows.
- Keep both plugin manifests and the shared skill consistent with the runtime.
- Treat generated names as suggestions until a lookup establishes their status.
- Commit rebuilt `dist/` and `skills/find-domains/scripts/domain-scout.cjs` with
  every source change; Git-based plugin installs run them as committed.

## Delegating to Codex

Hand clearly defined implementation tasks to Codex through the Codex plugin
(`codex:codex-rescue` in its own worktree); keep user-facing behavior and
wording, the skill and tool descriptions, and architecture with Claude. Always
use `gpt-6-astra`; medium for mechanical edits, high for multi-file work with
clear acceptance checks, xhigh for cross-cutting changes or root-cause
diagnosis. Decide contracts first; parallel tasks never share files. Codex
leaves changes uncommitted; review the diff, rebuild, and rerun the proving
check (and any check Codex reports as blocked) before committing. Read
`docs/codex-delegation.md` for this project's traps, and log each refused
command in its tally.

