# TASK: Compress Comments — server-cli-core

Strip noise comments from all source files. One PR: `feature/compress-comments`.

## Rubric

**Delete entirely:**
- Inline comments that narrate what the immediately following code obviously does
- Duplicate notes (keep first, delete rest)
- Double section dividers (`// ===...===` followed immediately by another `// ===...===`)
- `// Ignore errors` on a bare `catch` block — underscore prefix already signals intentional ignore
- `// CASCADE will handle related tables` and similar SQL-obvious observations

**Keep (load-bearing):**
- WHY comments: hidden constraints, past bugs, non-obvious invariants, retirement notes, device quirks
- PRAGMA-based or schema-related explanations not obvious from code
- Any comment referencing a specific bug, task, or EPIC by name
- Empty catch pattern: if removing `// Ignore errors` from `catch (_e) {}`, replace with `catch (_e) { /* ignore */ }` to satisfy ESLint no-empty

**Compress (signal buried in verbosity):**
- File-level headers: keep architecture notes and table lists, trim pure prose
- JSDoc on complex functions: keep description line(s) and all `@param`/`@returns` lines

## Files to Process

```
index.js
lib/bootstrap.js
lib/command-interceptors.js
lib/command-registry.js
lib/confirm.js
lib/errors.js
lib/event-broadcaster.js
lib/files.js
lib/format.js
lib/history.js
lib/module-registry.js
lib/prompt.js
lib/session-state.js
lib/shell-builtins.js
lib/shutdown-service.js
lib/sqlite-connection.js
lib/status-contract.js
lib/telemetry-context.js
modules/help/help-commands.js
modules/history/history-commands.js
modules/log/log-commands.js
modules/log/logger.js
modules/quit/quit-commands.js
examples/two-module-demo/index.js
examples/two-module-demo/modules/count/count-commands.js
examples/two-module-demo/modules/greet/greet-commands.js
```

Skip: `eslint.config.js` (config, not source).

## Execution

```bash
# From /Users/ryangrow/Projects/server-cli-core
git pull --ff-only origin main
git switch -c feature/compress-comments
# ... edit files per rubric ...
npm run lint       # verify clean
npm test           # verify 0 regressions
git add -p         # stage only comment-change files
git commit -m "refactor: compress comments"
git push -u origin feature/compress-comments
gh pr create --base main --head feature/compress-comments \
  --title "refactor: compress comments" \
  --body "Strip noise comments per rubric. No logic changes."
```
