# server-cli-core

A small framework for building modular Node.js CLI servers. It
gives you a persistent REPL prompt, a pluggable command-dispatch
registry, directory-based module discovery, and a shutdown
service with LIFO cleanup — plus a few primitives a long-running
CLI server actually needs (session-state KV, SQLite connection
cache, WebSocket event broadcaster, ambient transaction-context).

Vanilla JS, native ESM, no build step, no native dependencies.

It is used for electron apps that are not just CLI based but
connecting to the node server from a browser. A full app can
be developed in command line commands, and later a web interface
can be implemented using the same commands supported by the modules. 

## WARNING - no security layer implemented yet

This is intended to run locally on a computer, if you open a socket
for listening, then it is open to anybody in your network with visibility
to your address. This will probably get implemented as a different package.

## Why this package exists

It was clear when developing the platform app using AI that
a very modular approach was needed. It needed to be well defined
what a module looks like, how to invoke different commands in
the module, and how modules can interact with each other.

Additionally, i did not want to concern myself with the web
interface initially. That came later for the platform app.

The concept of using metadata to define the commands available
in a module has proven valuable for agentic workflows and
human user interfaces. 

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
  per-handler timeouts, replacing fragmented
  `process.on('SIGTERM')` setups.
- **Module discovery** — directory walk + `<name>-commands.js`
  convention so a consumer's modules self-register at startup.
- **Pre-dispatch / unknown-command interceptors** — top-level
  hooks any module can register at load time.
- **Status contract** — typed `{ level, summary, details, issues }`
  per module so a generic renderer covers all of them.
- **Session-state Key Value file store ** — namespaced JSON with atomic writes.
- **Shared SQLite connection cache** — opt-in helper for
  consumers that persist to SQLite.
- **Event broadcaster** — generic WebSocket pub/sub primitive
  for streaming server events to browser clients.
- **Telemetry-context primitives** — ambient transaction IDs for timing statistics.
  that flow through async cleanup.

If your project is a **one-shot CLI** (`mycli command --flag`),
use `commander` or `oclif` instead — they are better at that
shape. `server-cli-core` is for the case where the user opens a
prompt, types commands at it, and expects state to persist
across those commands until they `quit`.

[commander]: https://github.com/tj/commander.js
[yargs]: https://github.com/yargs/yargs
[oclif]: https://oclif.io/
[inquirer]: https://github.com/SBoudrias/Inquirer.js
[ink]: https://github.com/vadimdemedes/ink
[Vorpal]: https://github.com/dthree/vorpal

## Install

Pin to a release tag in your `package.json`:

```json
{
  "dependencies": {
    "server-cli-core": "github:rdgco/server-cli-core#v0.1.0"
  }
}
```

The package installs verbatim — no build step, no transpile.
Pin to a tag (not `main`) for reproducibility.

**Engine:** Node `^25.0.0`. ESM only.

## Quick start

A minimum consumer is ~10 lines:

```js
#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrap } from 'server-cli-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await bootstrap({
  modulesDir: path.join(__dirname, 'modules'),
  promptText: 'app> ',
  banner: 'My App ready. Type "help" for commands.'
});
```

Each subdirectory under `modulesDir/` becomes a module. The
package auto-discovers and loads them at startup. The bundled
`log`, `help`, `history`, and `quit` modules are auto-loaded
alongside, so a consumer gets a working shell without wiring
those up.

A complete worked example (two consumer modules + colocated
test) lives in [`examples/two-module-demo/`](./examples/two-module-demo/).

## Module shape

A module is a directory `<modulesDir>/<name>/` containing a
`<name>-commands.js` file. The file exports:

```js
// <modulesDir>/greet/greet-commands.js

// Required: identifying metadata used by `help` and the prompt.
export const metadata = {
  name: 'Greet',                 // display label
  prefix: 'greet',               // typed-command prefix
  description: 'Say hello',
  commands: {                    // optional shape used by the help summary
    'greet <name>': 'Print a greeting'
  }
};

// Required: handles `<prefix> <args...>`. Receives the args after the prefix.
// Return `'exit'` to signal the shell should run shutdown and exit;
// return `true`/`false`/anything else for normal handling.
export async function handle(parts) {
  console.log(`hello, ${parts[0]}`);
  return true;
}

// Optional: tab-completion for `<prefix> <partial>`. Returns
// `[completions, line]` per Node's readline contract.
export function autocomplete(parts, line) {
  return [[], line];
}

// Optional: lifecycle init. Called once after every module loads,
// before the REPL starts. Throw to fail startup; set
// `metadata.continueOnInitFailure = true` to allow soft-failure.
export async function init() {
  // Set up any state your handlers need at runtime.
}
```

For modules with subcommands, use the
[`createDispatcher`](#public-api) helper:

```js
import { createDispatcher } from 'server-cli-core';

export const commands = {
  list: { description: 'List items', handler: () => listItems() },
  add:  { description: 'Add an item', handler: args => addItem(args[0]) }
};

const dispatcher = createDispatcher({ prefix: 'item', commands, defaultCommand: 'list' });
export const handle = dispatcher.handle;
export const autocomplete = dispatcher.autocomplete;
```

## Public API

Top-level imports cover the headline surface. Subpath imports
(`server-cli-core/lib/<name>.js`) are also exposed for consumers
that want internal helpers.

### Entry point

| Export | What it does |
|---|---|
| `bootstrap(options)` | Discovers modules, runs init, wires the REPL + signal handlers, returns `{ executeCommand, shutdown }`. See `lib/bootstrap.js` for the full options reference. |

### Command dispatch

| Export | What it does |
|---|---|
| `createDispatcher({ prefix, commands, defaultCommand?, fallback?, fallbackAutocomplete? })` | Build a dispatcher from a command registry. Returns `{ commands, handle, autocomplete }` — assign `handle` and `autocomplete` to your module's exports. |
| `flattenCommands(commands, prefix)` | Walk a registry into a flat `[{ usage, description }]` list — used by `help` rendering. |

### Command interceptors

| Export | What it does |
|---|---|
| `registerPreDispatch(name, fn)` | Register a hook that sees the raw input before dispatch. Returns `{ handled }` to claim, `{ rewrite: '...' }` to substitute, or `null` to pass through. |
| `registerUnknownCommand(name, fn)` | Register a fallback for inputs no module matched. Last chance to interpret before `"Unknown command"`. |
| `runPreDispatch(input)` / `runUnknownCommand(parts)` | Invoke the registered interceptors directly (mostly used internally by bootstrap). |
| `getRegistered()` | Inspect the current set of registered interceptors. |

### Shell built-ins

| Export | What it does |
|---|---|
| `tryShellBuiltin(parts)` | Try to handle input as `clear` or `wait <ms>`. |
| `applyPluralRewrite(parts, modules)` | Rewrite `<module>s` → `<module> list` when the module exposes a `list` command. |
| `moduleHasListCommand(module)` | Helper used by the rewrite logic. |

### Shutdown service

| Export | What it does |
|---|---|
| `onShutdown(name, fn)` | Register a cleanup handler. Runs in LIFO order during shutdown. |
| `runShutdown(reason)` | Invoke all registered handlers (idempotent). |
| `hasShutdownRun()` / `isShuttingDown()` | Inspect shutdown state. |

### Module registry

| Export | What it does |
|---|---|
| `getModules()` | Return the loaded module map. Modules use this to walk the registry (e.g. `help` rendering). |
| `setModules(map)` | Replace the registered map. Bootstrap calls this; consumer code rarely needs to. |
| `clearModules()` | Empty the registry — for tests / teardown. |

### Status contract

| Export | What it does |
|---|---|
| `isModuleStatus(value)` | Type-check that an object satisfies the `ModuleStatus` shape. |
| `unknownStatus(reason)` | Build an `unknown`-level status (escape hatch for modules that can't report). |

### Session state

| Export | What it does |
|---|---|
| `sessionState` (default) | Namespaced JSON Key Value file store: `{ configure, get, set, update, clear, has, destroy, exists }`. |
| `getSessionState`, `setSessionState`, `updateSessionState`, `clearSessionState`, `hasSessionState`, `destroySessionState`, `sessionStateExists`, `configureSessionState` | The same surface as named exports, prefixed for top-level barrel imports. |

### SQLite connection cache

| Export | What it does |
|---|---|
| `openDatabase(name, options?)` | Open (or return cached) a `better-sqlite3` connection. Path-keyed cache. |
| `closeDatabase(nameOrPath)` | Close one connection. |
| `closeAll()` | Close every cached connection (safe in shutdown). |

### Telemetry context

| Export | What it does |
|---|---|
| `generateTransactionId()` | New `<timestamp>-<rand4>` ID. |
| `beginTransactionContext(id, triggerTimestamp?)` / `endTransactionContext()` | Set / clear the ambient transaction context. |
| `getActiveTransactionId()` / `getActiveTriggerTimestamp()` | Read the current context. |
| `TRANSACTION_EXPIRY_MS` | Expiry constant (30 s). |

### Event broadcaster

| Export | What it does |
|---|---|
| `initBroadcaster(clients)` | Hand the broadcaster the `Set<WebSocket>` your server maintains. |
| `setStateProvider(fn)` | Provide an async function returning full state for `broadcastStateUpdate`. |
| `broadcastEvent(eventType, data)` | Broadcast one event to all connected clients. |
| `broadcastStateUpdate()` | Broadcast a full state payload to all clients. |

### Logger (file-backed, module/level-filtered)

| Export | What it does |
|---|---|
| `log`, `logDebug`, `logInfo`, `logWarn`, `logErrorMessage`, `logTiming`, `logCategory`, `logObject` | Write to the log file at the appropriate level. |
| `initLogger`, `enableLogging`, `disableLogging`, `isLoggingEnabled`, `enableTiming`, `disableTiming`, `isTimingEnabled` | Logger lifecycle + global toggles. |
| `enableModule`, `enableModules`, `disableModule`, `disableModules`, `clearModuleFilters`, `getModuleFilterStatus` | Per-module filtering (driven by the `log` shell module). |
| `getLogPath`, `getLogStats`, `tailLog`, `headLog`, `clearLog` | Inspect / manage the log file. |
| `getLoggerState`, `setLoggerState`, `cleanupLogger` | Snapshot/restore + teardown. |

### CLI history

| Export | What it does |
|---|---|
| `loadHistory`, `saveHistory`, `getHistory`, `addCommand`, `clearHistory`, `getHistoryStats` | Read/write the readline history file. |

### File / format / error / prompt helpers

| Export | What it does |
|---|---|
| `getDirname`, `loadJsonFile`, `saveJsonFile`, `ensureDir`, `listFiles`, `listDirectories` | Small fs helpers. |
| `formatBytes`, `formatDuration`, `formatNumber`, `padString`, `truncate` | Display formatters. |
| `logError`, `withErrorHandling`, `safeJsonParse`, `safeFileRead`, `safeFileWrite` | Error-aware wrappers. |
| `confirmYesNo`, `confirmWithText`, `question`, `choose` | Async readline prompts. |

> **Naming-collision note:** the synchronous type-to-confirm
> prompt at `server-cli-core/lib/confirm.js` exports a
> `confirmWithText` of its own that shadows the async one above.
> The top-level barrel publishes the **async** version. The sync
> version stays reachable via the subpath import:
> `import { confirmWithText } from 'server-cli-core/lib/confirm.js'`.

## Versioning

Released tags are the contract:

- **`v0.x.y`** — breaking changes are allowed in any minor bump.
  v0.x is for the early-iteration window where the package's
  surface is still being discovered through real consumer use.
  Pin to a specific minor (e.g. `#v0.1.0`) and read the release
  notes before bumping.
- **`v1.0.0`** — set after at least two consumers have shipped
  against the package without API friction. Standard semver
  applies from that point: minors are additive, majors are the
  only place breaking changes happen.

The package is distributed as a GitHub URL dependency, not on the
npm registry. Upgrade by changing the `#tag` in your
`package.json#dependencies` and running `npm install`.

```diff
   "dependencies": {
-    "server-cli-core": "github:rdgco/server-cli-core#v0.1.0"
+    "server-cli-core": "github:rdgco/server-cli-core#v0.2.0"
   }
```

## Documentation

- [`docs/glossary.md`](./docs/glossary.md) — package vocabulary
  (bootstrap, dispatcher, registry, interceptor, etc.).
- [`examples/two-module-demo/`](./examples/two-module-demo/) —
  worked end-to-end example with a colocated smoke test.

## License

ISC
