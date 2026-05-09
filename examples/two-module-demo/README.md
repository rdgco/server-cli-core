# two-module-demo

A 50-line example consumer of `server-cli-core`. Demonstrates the
end-to-end shape: an `index.js` that calls `bootstrap`, plus a
`modules/` directory containing two minimal modules.

## Run interactively

```bash
node examples/two-module-demo/index.js
```

At the prompt, try:

```
help
greet world
count
count
count peek
count reset
quit
```

## What's here

- `index.js` — the consumer entry. Imports `bootstrap` from
  `server-cli-core` and calls it with `modulesDir` plus a couple
  of cosmetic knobs.
- `modules/greet/greet-commands.js` — minimal stateless module.
  One command, one handler.
- `modules/count/count-commands.js` — stateful module with
  subcommands via `createDispatcher`. Counter survives across
  invocations because the module is loaded once at startup.
- `example.test.js` — smoke test that boots the example via
  `bootstrap({ ..., autoStartRepl: false })` and drives the
  dispatch chain through the returned `executeCommand` handle.
  Runs as part of the package's test suite.

## Why two modules

One forces the bootstrap signature to handle plurality (both
modules must show up in `help`, in tab-completion, and dispatch
correctly). One module wouldn't catch most plurality bugs.
