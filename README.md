# server-cli-core

A small framework for building modular Node.js CLI servers. It
gives you a persistent REPL prompt, a pluggable command-dispatch
registry, directory-based module discovery, and a shutdown service
with LIFO cleanup — plus a few primitives a long-running CLI
server actually needs (session-state KV, SQLite connection cache,
WebSocket event broadcaster, ambient transaction-context).

Vanilla JS, native ESM, no build step, no native dependencies.

> **Status:** v0.0.0 (chassis only). The first usable release is
> v0.1.0, which ships the moved shell-bound files plus the
> `bootstrap()` entry point.

## Why this package exists

Node has plenty of one-shot CLI frameworks ([commander],
[yargs], [oclif]) and prompt libraries ([inquirer], [ink]).
What it lacks, in 2026, is a maintained framework for the
**interactive shell** pattern — a persistent prompt with
named commands, history, autocomplete, and a place for your
modules to register their own shell-level concerns.

[Vorpal] occupied this niche from 2015 until its author stepped
away in 2017; the repo's last commit is from 2018, dozens of
issues sit open, and it has not been updated for modern Node or
ESM. The post-Vorpal answer the ecosystem converged on is
"compose `commander` + `inquirer` + your own signal handling +
your own REPL loop." That composition, written enough times,
ends up looking like this package.

`server-cli-core` adds a few things on top of the bare REPL +
dispatch idea:

- **Shutdown service** — single LIFO cleanup registry with
  per-handler timeouts, replacing fragmented `process.on('SIGTERM')`
  setups.
- **Module discovery** — directory walk + `<name>-commands.js`
  convention so a consumer's modules self-register at startup.
- **Pre-dispatch / unknown-command interceptors** — top-level
  hooks any module can register at load time.
- **Status contract** — typed `{ level, summary, details, issues }`
  per module so a generic renderer covers all of them.
- **Session-state KV** — namespaced JSON KV with atomic writes.
- **Shared SQLite connection cache** — opt-in helper for
  consumers that persist to SQLite.
- **Event broadcaster** — generic WebSocket pub/sub primitive
  for streaming server events to browser clients.
- **Telemetry-context primitives** — ambient transaction IDs
  that flow through async cleanup.

If your project is a **one-shot CLI** (`mycli command --flag`),
use `commander` or `oclif` instead — they are better at that
shape. `server-cli-core` is for the case where the user opens a
prompt, types commands at it, and expects state to persist across
those commands until they `quit`.

[commander]: https://github.com/tj/commander.js
[yargs]: https://github.com/yargs/yargs
[oclif]: https://oclif.io/
[inquirer]: https://github.com/SBoudrias/Inquirer.js
[ink]: https://github.com/vadimdemedes/ink
[Vorpal]: https://github.com/dthree/vorpal

## Install

Once v0.1.0 ships:

```json
{
  "dependencies": {
    "server-cli-core": "github:rdgco/server-cli-core#v0.1.0"
  }
}
```

The package installs verbatim — no build step, no transpile.
Pin to a tag for reproducibility.

## Quick start

A two-module example will live in `examples/two-module-demo/`
once that lands. Until then, the intended shape is roughly:

```js
import { bootstrap } from 'server-cli-core';

await bootstrap({
  modulesDir: new URL('./modules/', import.meta.url).pathname,
  promptText: '> '
});
```

Each module is a directory under `modulesDir/` containing a
`<name>-commands.js` file that exports a `commands` object the
shell registers at startup.

## Public API

The full API lands in v0.1.0. Headline exports:

- `bootstrap({ modulesDir, projectInterceptors?, ... })`
- `createDispatcher(...)` — command registry factory
- `onShutdown(handler)`, `runShutdown()` — shutdown service
- `registerPreDispatch(...)`, `registerUnknownCommand(...)` —
  command interceptors
- `sessionState` — namespaced JSON KV
- `openDatabase`, `closeDatabase`, `closeAll` — SQLite cache
- `broadcastEvent` — WebSocket pub/sub
- `log`, `logDebug`, `logInfo`, `logWarn`, `logErrorMessage` —
  logger

Subpath imports (`server-cli-core/lib/...`,
`server-cli-core/modules/...`) are also exposed via
`package.json#exports` for consumers that want to reach internal
helpers directly.

## License

ISC
