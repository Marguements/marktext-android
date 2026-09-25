---
name: linear-task
description: Work a MarkText Android issue end to end from Linear — pick the issue (given MAT-n, or the highest-priority Todo in the earliest open milestone), move it through In Progress → In Review, implement within scope, verify, open the PR, and file follow-ups as new Backlog issues. Use when the user says "/linear-task", "work on MAT-12", "pick up the next Android issue", or asks to continue the Android roadmap.
---

# linear-task

Drives one Linear issue from the **MarkText Android** project (team "Mat Argue",
keys `MAT-n`) to a reviewed PR. Read `packages/android/CLAUDE.md` first; its
invariants and workflow apply.

## 1. Pick the issue

- If an issue key was given (`$ARGUMENTS`, e.g. `MAT-12`), fetch it with the
  Linear `get_issue` tool.
- Otherwise list issues in project "MarkText Android" with status `Todo`, and
  choose the highest priority in the earliest milestone that still has open
  issues (`M1 Reliability` → `M2 Workspace & images` →
  `M3 Android integration & design` → `M4 Polish & release`). Respect
  "blocked by" relations and any "Depends on" section in the body. If nothing
  is in Todo, propose the top Backlog candidates to the user and stop.
- Tell the user which issue you picked and why, in one line.

## 2. Claim it

- Set status **In Progress** and assignee `me`.
- Read the files named in the issue body plus the relevant docs:
  `packages/android/docs/BRIDGE.md` for bridge work, `docs/DESIGN.md` for UI.

## 3. Implement within scope

- Use the branch the session assigned; if you may choose, use the issue's
  `gitBranchName`.
- Implement only what the issue's Proposal/Acceptance describe. If the proposal
  is wrong or a better approach exists, say so and follow the better approach,
  noting it in the PR.
- Anything else you notice (bugs, refactors, ideas) → create a new Linear issue:
  status Backlog, project "MarkText Android", the right milestone, one type label
  (`Bug`/`Feature`/`Improvement`) + area labels
  (`android-web`/`android-shell`/`muya`/`ci`/`design`/`security`/`docs`),
  body with Problem / Proposal / Files / Acceptance. Mention it in the PR under
  "Follow-ups". Do not widen the PR.

## 4. Verify

Run what applies and report real results:

```bash
pnpm --filter marktext-android typecheck
pnpm --filter marktext-android build:web
pnpm --filter marktext-android test            # once MAT-12 has added it
pnpm --filter @muyajs/core test                # if packages/muya changed
pnpm run lint                                  # repo-wide ESLint
(cd packages/android && ./gradlew assembleDebug lint)   # when an Android SDK is available
```

For UI changes, run `pnpm --filter marktext-android dev` and exercise the flow
in Chromium (Playwright is installed); walk through each Acceptance bullet.
If Kotlin could not be compiled (no SDK in the container), say so in the PR.

## 5. Ship

- Commit with a message that starts with the change and ends with
  `Refs MAT-n` (or `Fixes MAT-n`).
- Push and open a PR against `develop` of `Marguements/marktext-android`,
  filling `.github/PULL_REQUEST_TEMPLATE.md`; replace `Closes #` with a link to
  the Linear issue. Title: `<concise change> (MAT-n)`.
- Move the issue to **In Review**, add the PR URL as a link attachment and a
  short comment summarising what changed and how it was verified.
- If milestones or scope changed, update `packages/android/docs/ROADMAP.md`.

## 6. After merge

When told the PR merged (or you observe it), set the issue to **Done**.
