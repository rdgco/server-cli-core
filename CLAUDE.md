# server-cli-core — Claude Code Project Instructions

## Source Control Rule (READ FIRST)

**You only commit code on a feature branch you created from the
latest `main`, when the operator asks you to implement a task.**
You may push that feature branch to `origin` and open a pull
request for it. Everything else in source control stays
operator-only.

### Allowed (when implementing a task)

- `git checkout main` then `git pull --ff-only origin main`.
- `git switch -c feature/<descriptive-slug>` (or
  `git checkout -b feature/<slug>`).
- Work on that branch: `git add`, `git commit`, iterate.
  `git rebase main` from your feature branch is fine when you
  need upstream changes; never the other direction.
- Publish: `git push -u origin feature/<slug>` (first push) or
  `git push` on subsequent pushes — only when upstream is your
  feature branch, never `main`.
- `gh pr create` to open the pull request, with a clear title
  and a body describing the change. Use a HEREDOC for the body
  so multi-line markdown stays formatted.

### Forbidden (always)

- **Never commit, push, merge, rebase, reset, or otherwise
  mutate `main` directly.** A PreToolUse hook
  (`.claude/hooks/protect-main.sh`) enforces this at the harness
  level. If you ever realize you're on `main`, switch to a
  feature branch before doing anything else.
- **Never `git push --force` / `-f` / `--force-with-lease`
  anywhere.** Force-push on a feature branch (after a rebase) is
  operator-only — better to open a fresh branch and let the
  operator decide.
- **Never `gh pr merge`, `gh pr close`, `gh pr reopen`.** PR
  merging and closure are operator-only.
- **Never delete `main` or `master`** locally or remotely.
- **Never run `git config --global` / `--system`** or otherwise
  mutate shared git config.
- **Never `gh repo create/delete/edit`,
  `gh release create/edit/delete`, `gh workflow run/enable/disable`,
  `gh secret set/delete`** or any destructive GitHub CLI
  command. Read-only `gh` commands are fine.
- **Never amend, rewrite, squash, or otherwise modify pushed
  commit history.** The operator handles cleanup before merge.
- **Never modify or move existing tags**, and never create a tag
  on your own initiative. **Tag creation is operator-delegated**:
  when the operator explicitly says "tag and push vX.Y.Z" after
  a version-bump PR merges, create the annotated tag on the merge
  commit of `main` and push it (`git tag -a vX.Y.Z <merge-sha> -m
  "…" && git push origin vX.Y.Z`). Stick to the exact name and
  commit the operator specified — never freelance a different
  name, retag, or modify an existing tag. Mirrors the language
  in `visualization-layer-core`, `visualization-bundle-examples`,
  `visualization-harness`, and `midi-daddy` so the same
  delegation flow works across the ecosystem.
- **Never bypass the pre-commit hook with `--no-verify`** unless
  the operator explicitly asks for it. The hook
  (`.husky/pre-commit`) runs `npm run lint && npm test` and
  gates every commit. If it fails, fix the underlying issue.

### When the task is complete

After the work is committed and the feature branch is pushed,
**you open the PR.** Don't stop at push and ask the operator to
click a URL — run `gh pr create` from the feature branch with a
clear title and body. The body should describe the change, the
rationale, and a `## Test plan` section listing what the
reviewer should verify.

## Package Identity Rule

**This package stands on its own.** Its README, source comments,
in-repo docs, package metadata, and going-forward commit messages
do not reference any specific consuming project (e.g., the
operator's other repos that depend on this package). The
discoverability and credibility of `server-cli-core` shouldn't
be tied to "this came out of one specific operator's project."

Consumer projects can and should reference `server-cli-core` —
that's a consumer naming its dependency. The asymmetry is the
point: the consumer can name its dependency, the dependency does
not name its consumer.

When writing motivation prose (README, docs, commit bodies), lean
on:
- The post-Vorpal interactive-CLI niche (Vorpal unmaintained
  since 2018; ecosystem converged on "compose primitives + roll
  your own").
- The operational primitives this package adds (shutdown service,
  session-state KV, sqlite-cache, event-broadcaster,
  telemetry-context).

## Module Conventions

- **Directory name is the dispatch key.** The module's directory name
  is what users type at the prompt and what `getModules()` exposes.
  `metadata.prefix` is vestigial — omit it from new modules and remove
  it from existing ones opportunistically. Do not add dispatch logic
  that reads `metadata.prefix`; if a module genuinely needs a prefix
  that differs from its directory name, raise it as a design question
  rather than patching bootstrap.
- **The REPL is for testing and architecture inspection, not end-user
  convenience.** Shortcuts and aliases that hide structure are actively
  unhelpful; transparent 1:1 naming (directory = command) is the goal.

## Project Shape

- **Vanilla JS, native ESM** — `import`/`export`, no CommonJS,
  no transpile, no build step.
- **Zero native dependencies.** If a feature needs a native
  binding, it doesn't belong in this package — it belongs in the
  consumer.
- **Node ≥ 25** per `package.json#engines` and `.nvmrc`.
- **Testing.** Jest with tests colocated next to the modules they
  test (`<name>.test.js`). `npm test` covers the suite; CI runs
  it on every push and PR.
- **Linting.** ESLint flat config at `eslint.config.js`. Real-bug
  rules from `@eslint/js` recommended plus a curated stylistic
  block (single quotes, semicolons, 2-space indent).
- **Pre-commit gate.** Husky runs `npm run lint && npm test`
  before every commit. Don't skip it.

## Working Style

- Read before writing. When asked to modify code, read the file
  you're modifying *and* whatever reads or writes its outputs.
- Match existing patterns. The package has consistent
  conventions; if you're tempted to deviate, surface why and ask
  first.
- Small, focused changes. Don't roll cleanup into feature work
  without flagging it as a separate concern.
- Default to acting, not asking. If the operator pointed you at
  a task and the next step is clear, just do it. Reserve
  questions for genuine ambiguity (design decisions, scope
  changes, destructive actions outside the workflow rules).
