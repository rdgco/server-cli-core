# Glossary

Vocabulary specific to `server-cli-core`. Add an entry when this
package's surface introduces or renames a term; remove an entry
when a term goes away. Domain terms specific to consumers (cue,
fixture, route, etc.) belong in the consumer's own glossary, not
here.

## Index

[bootstrap](#bootstrap) · [command](#command) ·
[command file](#command-file) · [dispatcher](#dispatcher) ·
[fallback](#fallback) · [handle](#handle) ·
[interceptor](#interceptor) · [lifecycle hook](#lifecycle-hook) ·
[loadOrder](#loadorder) · [metadata](#metadata) ·
[module](#module) · [module registry](#module-registry) ·
[onBeforeRepl](#onbeforerepl) · [onModuleLoaded](#onmoduleloaded) ·
[prefix](#prefix) · [registry](#registry) · [REPL](#repl) ·
[shell built-in](#shell-built-in) · [shutdown chain](#shutdown-chain) ·
[shutdown service](#shutdown-service) · [status contract](#status-contract) ·
[subpath import](#subpath-import)

## Core entry

#### bootstrap

The package's main entry function. Discovers and loads modules,
runs each module's `init()`, fires consumer lifecycle hooks,
registers the shell-level shutdown chain, wires signal handlers,
and (in production mode) starts the REPL. Defined in
`lib/bootstrap.js`. Returns a `{ executeCommand, shutdown }`
handle.

## Modules

#### module

A directory under the consumer's `modulesDir` (or the package's
own `modules/` for the bundled set). Each module owns a slice of
the CLI's command surface: a `prefix` plus a `handle` function
plus optional `init`, `autocomplete`, and `commands` exports.

#### command file

The `<name>-commands.js` file inside a module's directory.
Bootstrap dynamic-imports this file to load the module. Its
exports must follow the [module shape](../README.md#module-shape).

#### metadata

The required `metadata` export of a command file. Carries
`name`, `prefix`, `description`, and an optional `commands`
object that the help-summary renderer walks. May also carry
`continueOnInitFailure: true` to mark soft-failure on init.

#### prefix

The first word the user types to address a module — e.g. `greet`
or `count`. Declared in the module's `metadata.prefix` and used
by the dispatcher to route input.

#### handle

The function exported by every module that processes input
parts. Receives the args after the prefix. Returns `'exit'` to
trigger shutdown, or anything else for normal handling. The
`createDispatcher` helper produces a `handle` for modules with
subcommands; modules with a single action can write `handle`
directly.

#### lifecycle hook

A callback the consumer passes into `bootstrap()` to run code at
a specific phase. Two are defined:
- [`onModuleLoaded`](#onmoduleloaded) — after each module loads.
- [`onBeforeRepl`](#onbeforerepl) — after every module's `init()`,
  before the REPL prompts.

#### onModuleLoaded

Bootstrap option. `(name, module) => void|Promise<void>`. Fires
after each module loads (and after the registry has been
updated). Intended for cross-module wiring that needs to see the
current registry state via `getModules()`.

#### onBeforeRepl

Bootstrap option. `({ modules }) => Promise<void>`. Fires after
every module's `init()` completes, before the REPL starts.
Intended for project-specific startup work that needs the full
module set to be live.

#### loadOrder

Bootstrap option. `string[]`. Module names to load first, in the
given order. Any modules not listed load alphabetically
afterwards. Use when one module needs to be available for other
modules' init time (e.g. a `quit` confirm registry that other
modules register their text into).

## Command dispatch

#### command

A unit of work the user can invoke at the prompt. Modeled as an
entry in a module's `commands` registry: `{ description, handler,
usage?, autocomplete?, subcommands? }`. The dispatcher routes
input to the right command's handler.

#### registry

The `commands` object a module exports — a map from command name
to entry. Hand it to `createDispatcher` (or walk it yourself).

#### dispatcher

Built by `createDispatcher({ prefix, commands, defaultCommand?, fallback?, fallbackAutocomplete? })`.
Returns `{ commands, handle, autocomplete }` so the module can
re-export `handle` and `autocomplete` derived from the registry.

#### interceptor

A hook that participates in the shell's six-layer dispatch
chain at one of two points:
- **pre-dispatch** — sees raw input before any module dispatch;
  may claim it, rewrite it, or pass through.
- **unknown-command** — fires only if module dispatch found no
  match; last chance to interpret the input before the shell
  prints `Unknown command`.

Modules self-register interceptors at module-load time via
`registerPreDispatch` / `registerUnknownCommand`. Used for
project-specific shortcuts (input rewrites, name-based
fallbacks, etc.) without burdening the shell with project
knowledge.

#### shell built-in

A command the shell handles itself, regardless of which modules
are loaded. The package ships two: `clear` and `wait <ms>`.
Defined in `lib/shell-builtins.js`.

#### fallback

In `createDispatcher`, an optional function that runs when input
doesn't match any registered command. Like an unknown-command
interceptor, but scoped to a single module's surface.

## State + observability

#### module registry

The in-memory map of loaded modules, keyed by name. Bootstrap
populates it incrementally during module load. Consumers and
shell modules read it via `getModules()`. Defined in
`lib/module-registry.js`.

#### shutdown chain

The ordered set of cleanup handlers that fires at process exit.
Handlers run **LIFO** — the last one registered runs first. The
shell registers its own cleanups (close-databases, save-history,
farewell) at startup, BEFORE modules load, so those run last.

#### shutdown service

The shell-bound infrastructure that owns the [shutdown
chain](#shutdown-chain). Defined in `lib/shutdown-service.js`.
Modules subscribe at module-load time via `onShutdown(name, fn)`.
The service owns the actual signal handlers (SIGINT, SIGTERM,
uncaughtException, unhandledRejection) and calls `runShutdown`
exactly once.

#### status contract

The typed shape every module's `getStatus()` should return so a
generic renderer can drive a uniform "system status" surface
without per-module knowledge. Defined in
`lib/status-contract.js`. Three layers: `level` + `summary`
(one-line overview), `details` (deep dive), and `issues` (auto-
fix surface).

## Distribution

#### REPL

The interactive read-eval-print loop bootstrap runs by default.
Built on Node's `readline` with autocomplete delegated to each
module's `autocomplete` export. Disable via
`autoStartRepl: false` (intended for tests).

#### subpath import

A way to import a package's internal helpers directly, e.g.
`import { onShutdown } from 'server-cli-core/lib/shutdown-service.js'`.
Each shell-bound file has a corresponding entry in
`package.json#exports`. Top-level imports
(`from 'server-cli-core'`) are the mainstream path; subpath
imports are for consumers who need internal helpers the barrel
doesn't re-export, or who want to avoid pulling in the rest of
the barrel.
