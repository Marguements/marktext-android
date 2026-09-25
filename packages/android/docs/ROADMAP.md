# MarkText for Android — review & roadmap

Linear is the source of truth for status and priority:
[MarkText Android project](https://linear.app/arguelab/project/marktext-android-60d33f0228d1).
This page is the narrative: why each item matters and how the milestones fit
together. Update it when milestones or scope change, not for every status move.

_Last reviewed: 2026-09-25, against the port as landed in d20d7c4 / 90a5a6c._

## Where the port stands

**Solid today**
- Narrow, origin-scoped bridge with typed request/response and a browser
  fallback for `pnpm dev`.
- Correct Storage Access Framework use: persisted grants, "wt"→"w" write
  fallback, size cap, BOM strip, read-only intents open as untitled copies.
- Resilience: draft kept across restarts, renderer-crash `recreate()`, intents
  queued until the page is ready, back gesture routed through the page.
- Edge-to-edge insets and IME padding keep the formatting toolbar above the keyboard.

**Main risks found in review**
1. The draft lives in `localStorage`; quota errors are swallowed, so large
   documents can silently stop persisting → data loss on process death.
2. Saves are non-atomic and blind to on-disk changes (sync apps).
3. Images are embedded as `data:` URLs; relative images never render.
4. Closing Settings rebuilds Muya, losing undo, cursor and scroll.
5. No CSP although the page holds a privileged bridge and the app has INTERNET.
6. Line endings / BOM / trailing newline aren't preserved.
7. Outline jumps by DOM index, which can drift from `getTOC()`.
8. Async back handling blocks predictive back.
9. Share-as-text hits the ~1 MB Binder limit.
10. `main.ts` is monolithic; CI only typechecks and builds.

## Milestones

### M1 Reliability — never lose a user's words
Do this first; every later feature builds on durable state and tests.

| Issue | Item |
|---|---|
| MAT-5 | Store the unsaved draft natively instead of in localStorage |
| MAT-6 | Conflict-safe save (detect on-disk changes) |
| MAT-7 | Preserve line endings, BOM and trailing newline |
| MAT-8 | Apply settings without rebuilding the editor |
| MAT-9 | Content-Security-Policy for the editor page |
| MAT-10 | Outline jumps to the tapped heading |
| MAT-11 | Split `web/src/main.ts` into modules |
| MAT-12 | Vitest unit tests for the web layer |
| MAT-13 | Robolectric tests for `Documents` / `NativeBridge` |
| MAT-14 | CI runs web tests, Gradle lint and unit tests |
| MAT-36 | Contributor and Claude guidance (this doc set) |

Suggested order: MAT-11 → MAT-12 → MAT-5 → MAT-6 → MAT-7 → MAT-8 → MAT-9 →
MAT-10 → MAT-13 → MAT-14 (splitting first makes the rest testable).

### M2 Workspace & images — work with real note collections

| Issue | Item |
|---|---|
| MAT-15 | Open a folder as a workspace with a file tree |
| MAT-16 | Render relative images via a WebViewAssetLoader path handler |
| MAT-17 | Save picked/pasted images as files next to the note |
| MAT-18 | Multiple open documents |
| MAT-19 | Reload when the file changed while backgrounded |
| MAT-20 | Recent files: remove, pin, parent folder |

MAT-16 and MAT-17 depend on MAT-15's tree grant; MAT-19 builds on MAT-6.

### M3 Android integration & design — feel native

| Issue | Item |
|---|---|
| MAT-21 | Export to PDF via the print framework |
| MAT-22 | Share as a file through FileProvider |
| MAT-23 | App shortcuts, Quick Settings tile, widget |
| MAT-24 | PROCESS_TEXT and "append to inbox note" |
| MAT-25 | Predictive back with synchronous back state |
| MAT-26 | Toolbar reflects selection and adapts to context |
| MAT-27 | Typewriter mode and distraction-free writing |
| MAT-28 | Desktop themes and editor font choice |
| MAT-29 | Material 3 design pass |
| MAT-30 | Large-screen layout for tablets and foldables |
| MAT-31 | Block remote images / network diagrams option |

### M4 Polish & release — ready for other people

| Issue | Item |
|---|---|
| MAT-32 | CodeMirror 6 source mode |
| MAT-33 | Localisation from desktop locale files |
| MAT-34 | Backup and data-extraction rules |
| MAT-35 | Tagged releases, App Bundle, store metadata |

## Ideas not yet filed

Worth an issue when their milestone comes up:
- Git sync (JGit) or WebDAV sync for a workspace.
- Cross-file full-text search and `[[wiki-link]]` navigation within a workspace.
- Templates for new notes (daily note with date).
- Stylus handwriting-to-text (Android 14 `HandwritingDelegate`).
- Read-only "preview" mode for large files to avoid editor cost.
