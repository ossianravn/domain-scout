# Delegating tasks to Codex

Codex implements clearly defined tasks; Claude decides behavior, wording, design
and contracts, briefs Codex, and reviews. Workflow, levels and hard rules: the
`codex-delegation` skill. This file holds what is specific to Domain Scout.

## Project traps (put these in every brief's setup and action_safety blocks)

- Dependencies in a worktree: create a junction to the main checkout's
  `node_modules` (`cmd /c mklink /J node_modules C:\CodexApp\domain-scout\node_modules`);
  never install into or modify it.
- Build: `npm run check` (typecheck, esbuild bundles into the worktree's `dist/`,
  offline tests) is safe inside the worktree. Claude rebuilds in the main
  checkout and commits the bundles.
- Network: tests are offline fixtures. Live registry and DNS checks
  (`npm run smoke`, the CLI) are Claude's during review.
- Ports: none.
- Line endings: `core.autocrlf=true`; keep each file's existing endings.
- Local state the app writes: none.
- Verification policy: proportional verification. No unit tests; at most one
  boundary test through `DomainEngine.check` with fixtures faked at
  `ctx.request` / `ctx.whois`, shown to fail when the behavior breaks.
- Size: source and test files stay at or below 300 lines.

## Evidence

| Date | Task | Model, level | Time | Result |
|---|---|---|---|---|

## Refused-command tally

Every command Codex was refused. Approval refusals ("blocked by policy") come
from the plugin running Codex with automatic approval set to never; sandbox
errors come from its workspace limits. If refusals keep blocking checks that
matter, decide with the user whether to loosen Codex's permissions or patch the
plugin.

| Date | Task (model, level) | Refused command | Kind | Covered by |
|---|---|---|---|---|

Running total: 0 approval refusals, 0 sandbox errors, in 0 runs.
