# server-cli-core

Project-agnostic shell for building modular Node.js CLI servers.
Provides REPL, command dispatch, module discovery, and shutdown
handling — the chassis a domain-specific CLI server can layer its
modules on top of.

Extracted from [midi-daddy](https://github.com/rdgco/midi-daddy)
where this shell evolved over many iterations. Vanilla JS, no
build step, no native dependencies.

> **Status:** v0.0.0 (chassis only). The first usable release is
> v0.1.0 — see [`EPIC-create-server-cli-core` in midi-daddy](https://github.com/rdgco/midi-daddy/blob/main/docs/tasks/inprogress/EPIC-create-server-cli-core.md)
> for the rollout plan.

## Install

Once v0.1.0 ships:

```json
{
  "dependencies": {
    "server-cli-core": "github:rdgco/server-cli-core#v0.1.0"
  }
}
```

The package installs verbatim — no build step, no transpile. Pin
to a tag for reproducibility.

## Quick start

A working two-module example will live in `examples/two-module-demo/`
once that lands. Until then, see the parent epic for the planned
shape.

## Public API

The full API lands in v0.1.0. See [`EPIC-create-server-cli-core` § "Public API surface"](https://github.com/rdgco/midi-daddy/blob/main/docs/tasks/inprogress/EPIC-create-server-cli-core.md).

## License

ISC
