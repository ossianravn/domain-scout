# Install Domain Scout

Domain Scout 0.3.0 runs locally in Codex or Claude Code. The release includes
`dist/server.cjs` with its JavaScript dependencies bundled. End users do not
need to run `npm install`. Developers rebuilding from source use the commands
at the end of this guide.

## Requirements

- Node.js **22 or newer**, available as `node` to the client process.
- A current Codex installation with `codex plugin` support, or Claude Code with
  plugin support.
- Internet access to the domain lookup providers.

The GitHub repository includes the built bundles, so both clients can install
straight from it: use `ossianravn/domain-scout` in place of the folder path in
the `marketplace add` commands below (as in the README).

To install from a copy on disk instead, extract the complete archive into a
stable folder. Keep the included manifest files and `skills/` directory. Point
the commands below to the folder containing `plugin.json`, `package.json`, and
`dist/`, not to its parent.

Verify the runtime in the same terminal you will use to launch the client:

```sh
node --version
```

No API key is required for the default providers. Domain searches query the
selected providers over the network; the tools report their source and evidence.
The plugin searches and checks names; registration remains a separate action.

## Codex

Codex uses root `plugin.json` and `mcp.json`, plus the local catalog in
`.agents/plugins/marketplace.json`. Its current installation verb is `add`.

### macOS, Linux, or WSL

Replace the example folder with your extracted package location:

```sh
codex plugin marketplace add /absolute/path/domain-scout
codex plugin add domain-scout@domain-scout-local
codex plugin list --json
```

For a folder extracted on Windows and used from WSL, the first command can be:

```sh
codex plugin marketplace add /mnt/c/Users/YOUR_NAME/Downloads/domain-scout
```

Install Node and run Codex inside WSL when using these Linux paths.

### Windows PowerShell

```powershell
$domainScoutRoot = (Resolve-Path "$env:USERPROFILE\Downloads\domain-scout").Path
codex plugin marketplace add "$domainScoutRoot"
codex plugin add domain-scout@domain-scout-local
codex plugin list --json
```

Launch a new Codex session after installation. Select the `find-domains` skill
from the skill picker, or ask: “Use Domain Scout to find a domain for a Danish
AI news site.” The shared skill is `skills/find-domains/SKILL.md`.

## Claude Code

Claude uses `.claude-plugin/plugin.json` and root `.mcp.json`.

### Try it immediately

On macOS, Linux, or WSL:

```sh
claude --plugin-dir /absolute/path/domain-scout
```

On Windows PowerShell:

```powershell
$domainScoutRoot = (Resolve-Path "$env:USERPROFILE\Downloads\domain-scout").Path
claude --plugin-dir "$domainScoutRoot"
```

This loads the plugin for that session. Run `/domain-scout:find-domains` and
describe the project. Use `/mcp` to inspect the `domain-scout` server connection.

### Install persistently

On macOS, Linux, or WSL:

```sh
claude plugin marketplace add /absolute/path/domain-scout
claude plugin install domain-scout@domain-scout-local
```

On Windows PowerShell:

```powershell
$domainScoutRoot = (Resolve-Path "$env:USERPROFILE\Downloads\domain-scout").Path
claude plugin marketplace add "$domainScoutRoot"
claude plugin install domain-scout@domain-scout-local
```

Start a new Claude Code session and run `/domain-scout:find-domains`.
On WSL, use `/mnt/c/Users/YOUR_NAME/Downloads/domain-scout` for a package on the
Windows filesystem, and keep both Claude Code and Node in the WSL environment.

## Optional provider credentials

The default installation works without credentials. For Simply, set
`SIMPLY_API_KEY` (or its alias `SIMPLY_API_TOKEN`) to your API bearer token in
the environment that launches Codex or Claude Code. No account identifier is
needed. The server reads inherited variables; it does **not** load `.env`
files automatically. No credentials belong in the manifests or in a prompt.

In a POSIX shell, set `SIMPLY_API_KEY` with `export`; in PowerShell, set
`$env:SIMPLY_API_KEY`. Then launch the client from that same terminal. Restart
the client after changing its environment. A desktop app launched from an icon
may have a different environment from your terminal.

For a self-hosted Who-Dat fallback, set `DOMAIN_SCOUT_WHO_DAT_URL` and, if the
service requires authentication, `DOMAIN_SCOUT_WHO_DAT_TOKEN`. See
[the Docker/Dokploy guide](who-dat.md) for the pinned service example. It is
optional; the public demo is not configured as a bulk lookup source.

Default checks use HTTPS, except the documented IIS HTTP service and TCP
registry checks. WHOIS uses outbound TCP 43; Belgium and SWITCH availability
services use TCP 4343. Blocked connections remain unknown or use a supported
fallback. The optional proxy requires suitable outbound access on its host.

Inspect source routes without network access:

```sh
node dist/cli.cjs sources '{"tlds":["dk","de","ch","nl"]}'
```

The plugin starts with a bundled IANA routing snapshot. Call `domain_sources`
with `refresh: true` to update it in the current server. To update the snapshot
in a source checkout, run `npm run update:registry` followed by `npm run build`.

## What happens when you ask for names

The skill first resolves missing preferences: exact or close wording, a
brandable word, an invented name, or a blend. It can show examples and ask one
compact question when this materially changes the search. Known preferences
carry forward. The host agent creates candidates and the MCP server checks them
in batches, preserving provider evidence and uncertainty.

For example:

- “Find the shortest attractive domain for a short URL service.”
- “Find a memorable name for a second brain app; prefer `.com`.”
- “Find a Danish domain for an AI news site; prefer `.dk`.”

## Troubleshooting and updates

**`node` cannot be found:** install Node 22 or newer in the environment running
the client, then restart that client. Native Windows and WSL have separate
executable search paths.

**Codex has no `plugin` command:** update Codex. Do not substitute the Claude
`plugin install` command; Codex uses `plugin add`.

**Skill appears but tools do not:** inspect the MCP connection, confirm
`dist/server.cjs` exists, and confirm `node --version` is at least 22. Both native
MCP configuration files intentionally point to the same bundle with each
client's supported root placeholder.

**An updated source folder has no effect:** marketplace installations can use a
cached copy. Refresh or reinstall through the client and start a new session.
For active Claude development, use `--plugin-dir` with the working folder and
reload the plugin after changes.

**A result is unknown:** providers may not cover a TLD, may be rate limited, or
may fail. Treat unknown as unresolved. A missing registration record alone is
not proof that a registrar will sell the name at a particular price.

This local stdio package targets local Codex and Claude Code runtimes. A
browser-only client requires a separately hosted remote MCP deployment.

## Develop from source

From the project root, with Node 22 or newer:

```sh
npm ci
npm run build
```

The build creates the bundle used by both clients. Keep the version in
`package.json`, `plugin.json`, and `.claude-plugin/plugin.json` consistent.
Claude can validate the package with:

```sh
claude plugin validate /absolute/path/domain-scout
```

Use `claude --plugin-dir` for local iteration. After registering the Codex
marketplace, inspect its catalog with `codex plugin list --available --json`.
Client manifest validation does not replace an MCP handshake or a live
provider check.

## Official format references

Format and command references checked on 2026-10-23:

- [OpenAI: Build plugins](https://developers.openai.com/plugins/build/plugins)
- [OpenAI: Local MCP servers](https://developers.openai.com/plugins/deploy/desktop-only)
- [Agent Plugins specification](https://agent-plugins.org/specification)
- [Agent Plugins: MCP configuration](https://agent-plugins.org/plugin-authors/mcp-servers)
- [Claude: Plugin reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude: Plugin components](https://code.claude.com/docs/en/plugins/components)
- [Claude: Plugin CLI](https://code.claude.com/docs/en/plugins/cli-reference)
- [Claude: Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude: Create plugins](https://code.claude.com/docs/en/plugins/create)
