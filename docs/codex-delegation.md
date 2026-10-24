# Delegating tasks to Codex

Codex implements clearly defined tasks; Claude decides behavior, wording, design
and contracts, briefs Codex, and reviews. Workflow, levels and hard rules: the
`codex-delegation` skill. This file holds what is specific to Domain Scout.

## Project traps (put these in every brief's setup and action_safety blocks)

- Launching: this repository is nested inside `C:\CodexApp`, another repository,
  and the Agent tool's `isolation: "worktree"` creates a worktree of that parent,
  which does not contain Domain Scout. The `codex:codex-rescue` wrapper also
  refuses long multi-line briefs as "too complex to verify". Instead, create the
  worktree yourself (`git -C C:\CodexApp\domain-scout worktree add <dir> -b codex/<task>`),
  add the junction below, write the brief to a file outside the worktree, and run
  `codex exec --json --ephemeral -s workspace-write -m gpt-6-astra -c model_reasoning_effort=<level> -C <dir> - < <brief>`
  in the background.
- Dependencies in a worktree: create a junction to the main checkout's
  `node_modules` (`cmd /c mklink /J node_modules C:\CodexApp\domain-scout\node_modules`);
  never install into or modify it.
- Build: Codex's Windows sandbox stops esbuild from bundling ("Cannot read
  directory ../../..: Access is denied"), so `npm run check` fails at the build
  step inside Codex. Ask Codex for `npm run typecheck` and
  `node --import tsx tests/<file>.test.ts`; Claude runs `npm run check` in the
  worktree outside the sandbox, discards the regenerated bundles before
  committing there, and rebuilds and commits the bundles in the main checkout.
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
| 2026-10-24 | DNS screening provider: 7 source files and one boundary test | gpt-6-astra, high | 5.5 min | Followed the contract exactly; typecheck, boundary test and sabotage run passed in the sandbox; full suite blocked there, 37/37 when Claude ran it; live checks agreed with the registry |

## Refused-command tally

Every command Codex was refused. Approval refusals ("blocked by policy") come
from the plugin running Codex with automatic approval set to never; sandbox
errors come from its workspace limits. If refusals keep blocking checks that
matter, decide with the user whether to loosen Codex's permissions or patch the
plugin.

| Date | Task (model, level) | Refused command | Kind | Covered by |
|---|---|---|---|---|
| 2026-10-24 | DNS screening (gpt-6-astra, high) | `codex-companion.mjs task …` from the `codex:codex-rescue` wrapper, three attempts | Wrapper refusal: "too complex to verify that it stays inside the worktree" | Claude ran `codex exec` directly |
| 2026-10-24 | DNS screening (gpt-6-astra, high) | `npm run check` (esbuild bundling) | Sandbox error: "Cannot read directory … Access is denied" | Claude ran `npm run check` outside the sandbox: 37/37 |

Running total: 0 approval refusals, 1 sandbox error, 3 wrapper refusals, in 1 run.
