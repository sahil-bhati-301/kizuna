---
description: Show the budget light, or set usage figures manually when the guard has no data
argument-hint: "[<weekly%> <5h%>]"
model: haiku
---

If `$ARGUMENTS` is empty, run `cat ~/.claude/kizuna/usage.json` (if present) and report the light, weekly % vs today's line, 5h %, and the cache age. Do nothing else.

Otherwise run `node scripts/claude/budget.mjs set $ARGUMENTS` and relay its one-line output (light and level) verbatim. Figures come from the owner's `/usage` screen: weekly first, then 5-hour window.
