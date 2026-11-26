---
description: Write a checkpoint for the current WP (WIP commit, Checkpoint section, STATUS row) so the next session resumes without exploring
argument-hint: "[reason: wrap-up | checkpoint-now | 3-strike | owner-stop]"
model: sonnet
---

Write a checkpoint for the work package on the current branch. Reason: $ARGUMENTS (default: wrap-up).

1. Identify the WP id from the branch name (`wp/Wnn-k-<slug>`). If the branch is not a WP branch, say so and stop.
2. Commit everything on the branch and push it: `git add -A && git commit -m "wip(Wnn-k): checkpoint, <reason>"` then `git push origin wp/<branch>`. Record the short SHA.
3. Overwrite the `## Checkpoint` section of `docs/plan/wp/<id>.md` using template A.1, written for a reader with no context:
   - `Written: <timestamp> · Reason: <reason>`
   - `Branch: <branch> · Checkpoint commit: <sha> (pushed) · Usage at stop: week <%>, 5h <%>` (read `~/.claude/kizuna/usage.json`, or "?")
   - `Loop step:` spec-tests | implement | review | fix | full-verify | pr
   - `Criteria done: … · Remaining: …`
   - `Half done:` file, function, what exists, what is missing
   - `NEXT ACTION:` one imperative sentence, the first thing the next session does
   - `Verify state:` failing tests and whether that is expected
   - `Decisions this session:`, `Tried and rejected (do not retry):`, `Open questions:`
4. Set the WP's row in `docs/plan/STATUS.md` to `⏸ paused (<reason>) · resume: /wp <id>`.
5. Commit and push the two doc changes as part of the same checkpoint (amend the WIP commit or add `wip(<id>): checkpoint notes`), then update the SHA in the Checkpoint section if it changed.
6. Reply with two lines: the checkpoint commit SHA and the NEXT ACTION. Then end the session.
