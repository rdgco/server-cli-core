#!/bin/bash
# PreToolUse hook for Bash — protect the main branch from AI mutations.
#
# Reads {tool_name, tool_input: {command}} from stdin.
# Outputs hookSpecificOutput JSON on stdout to deny; nothing to allow.
#
# Allowed AI workflow:
#   git checkout main; git pull; git switch -c feature/X; work; commit;
#   git push origin feature/X; gh pr create
#
# Blocked:
#   - force-push anywhere
#   - any push targeting main/master
#   - any git mutation while currently on main/master
#   - deleting main/master
#   - gh pr merge / pr close / repo delete / release create / etc.

cmd=$(jq -r '.tool_input.command // ""')
[ -z "$cmd" ] && exit 0

# Determine current branch from cwd (Claude runs hooks in the project root).
current_branch=$(git branch --show-current 2>/dev/null || echo "")

deny() {
  jq -nc --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Split on &&, ;, || so chained commands are checked individually.
matches_any() {
  printf '%s\n' "$cmd" | tr '&;|' '\n' | grep -qE "$1"
}

# 1. Force push anywhere is forbidden.
if matches_any '^[[:space:]]*git[[:space:]]+push\b.*(--force|-f([[:space:]]|$))'; then
  deny "Blocked: force-push (--force / -f / --force-with-lease) is forbidden for AI. Create a fresh branch instead."
fi

# 2. Push targeting main/master explicitly is forbidden.
if matches_any '^[[:space:]]*git[[:space:]]+push\b.*[[:space:]](main|master)([[:space:]]|$)' \
   || matches_any '^[[:space:]]*git[[:space:]]+push\b.*:(main|master)([[:space:]]|$)'; then
  deny "Blocked: cannot push to main/master. Push to a feature branch and open a PR instead."
fi

# 3. gh pr merge merges into the PR's base (usually main) — operator only.
if matches_any '^[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge\b'; then
  deny "Blocked: 'gh pr merge' is operator-only. Operator handles PR merges."
fi

# 4. Deleting main/master is always forbidden.
if matches_any '^[[:space:]]*git[[:space:]]+branch[[:space:]]+(-d|-D|--delete)[[:space:]]+(main|master)([[:space:]]|$)' \
   || matches_any '^[[:space:]]*git[[:space:]]+push\b.*--delete.*[[:space:]](main|master)([[:space:]]|$)'; then
  deny "Blocked: cannot delete main/master branch."
fi

# 5. Other destructive remote operations.
if matches_any '^[[:space:]]*gh[[:space:]]+(repo[[:space:]]+(delete|create|edit|rename|archive)|pr[[:space:]]+(close|reopen)|release[[:space:]]+(create|edit|delete)|workflow[[:space:]]+(run|enable|disable)|secret[[:space:]]+(set|delete))\b'; then
  deny "Blocked: destructive GitHub operation. Operator-only."
fi

# 6. Global git config mutation is forbidden (per CLAUDE.md "NEVER update the git config").
if matches_any '^[[:space:]]*git[[:space:]]+config[[:space:]]+(--global|--system|--add|--unset|--unset-all|--remove-section|--rename-section)\b'; then
  deny "Blocked: cannot mutate git config."
fi

# 7. While currently on main/master: block direct mutations.
#    The expected flow is to switch to a feature branch first.
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
  if matches_any '^[[:space:]]*git[[:space:]]+(commit|merge|rebase|reset|cherry-pick|revert|am|stash[[:space:]]+pop|stash[[:space:]]+apply)\b'; then
    deny "Blocked: currently on '$current_branch' — direct mutations to the main branch are forbidden. Switch to a feature branch first: git switch -c feature/your-task"
  fi
  # Bare 'git push' (no remote/ref args) on main pushes to origin/main → block.
  if matches_any '^[[:space:]]*git[[:space:]]+push[[:space:]]*$'; then
    deny "Blocked: bare 'git push' from '$current_branch' would push to origin/$current_branch. Switch to a feature branch first."
  fi
fi

# Allow everything else.
exit 0
