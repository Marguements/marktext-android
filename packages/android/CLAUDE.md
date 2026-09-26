# CLAUDE.md — packages/android

Guidance for working on **MarkText for Android**. The repo-root `CLAUDE.md`
still applies (code style, commenting guidelines, pnpm workspace); this file
adds what is specific to the Android package.

## What this package is

A native Android app that runs MarkText's editor engine (`@muyajs/core`, from
`packages/muya`) inside a WebView. The web layer owns all editing UI; a thin
Kotlin shell owns everything the page cannot do: the Storage Access Framework,
sharing, system bars, insets and the back gesture.

```
web/ (TypeScript, Vite)          bridge (JSON messages)         app/ (Kotlin)
┌───────────────────────┐   MarkTextAndroid.postMessage   ┌───────────────────────┐
│ main.ts + modules  UI │ ──────────────────────────────▶ │ NativeBridge.kt       │
│ native.ts bridge API  │ ◀────────────────────────────── │  dispatch + pickers   │
│ style.css app chrome  │      replyProxy.postMessage     │ Documents.kt  SAF I/O │
│ index.html            │                                 │ MainActivity.kt host  │
└───────────────────────┘                                 └───────────────────────┘
```

| File | Owns |
|---|---|
| `web/index.html` | Static chrome: app bar, find bar, drawer, sheet + settings dialogs, snackbar |
| `web/src/main.ts` | Wiring only: native callbacks, app-bar buttons, keyboard shortcuts, `__mtHandleBack` / `__mtOnPause`, boot |
| `web/src/state.ts` | Settings, session and recent files + their `localStorage` persistence; DOM-free |
| `web/src/editor.ts` | Muya plugins, create/rebuild, source mode, change tracking, title |
| `web/src/files.ts` | New/open/save/save-as/export/share, recent-file opening, auto-save |
| `web/src/toolbar.ts` | Formatting toolbar and its block-type / insert sheets |
| `web/src/find.ts` | Find & replace bar |
| `web/src/drawer.ts` | Drawer, recent list, outline, about |
| `web/src/settings.ts` | Theme and the settings dialog |
| `web/src/ui.ts` | `$`, snackbar/`reportError`, bottom sheet, `keepEditorFocus` |
| `web/src/native.ts` | Typed bridge client + browser fallbacks. The **only** place the page talks to Kotlin |
| `web/src/style.css` | Design tokens (`--app-*`) and Muya dark-theme overrides |
| `web/src/icons.ts` | Material Symbols path data; `icon(name)` / `data-icon` hydration |
| `web/src/welcome.ts` | First-run document |
| `app/.../MainActivity.kt` | WebView config, asset loader, insets, back dispatch, renderer-crash recovery |
| `app/.../NativeBridge.kt` | Message dispatch, file/image pickers, intents (VIEW/EDIT/SEND), share, system bars |
| `app/.../Documents.kt` | Blocking SAF read/write, size caps; always called on the `io` executor |
| `vite.config.ts` | Builds `web/` into `app/src/main/assets/www/` (git-ignored) |

Web modules do no DOM work when imported: each exposes an `init*()` that
`main.ts` calls, so modules can be imported by unit tests without booting the page.

Deeper references:
- `docs/BRIDGE.md` — message protocol, method catalog, how to add a method.
- `docs/DESIGN.md` — UI and interaction rules.
- `docs/ROADMAP.md` — review findings and milestones (mirrors Linear).
- `README.md` — user-facing install/build instructions.

## Commands

Run from the repo root unless noted.

```bash
pnpm install
pnpm --filter marktext-android dev         # page in a desktop browser; file ops fall back to upload/download
pnpm --filter marktext-android typecheck   # builds muya types first, then tsc --noEmit (CI enforces)
pnpm --filter marktext-android build:web   # required before any Gradle build

cd packages/android
./gradlew assembleDebug                    # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug                     # to a connected device
./gradlew assembleRelease                  # what CI builds (minified, signed with dev key unless secrets set)
```

Debug builds install as `me.marktext.android.debug` beside release and are
inspectable at `chrome://inspect`. CI: `.github/workflows/android.yml`
(typecheck → build:web → assembleRelease → upload APK → `android-latest` release on develop).

Cloud sessions usually have no Android SDK: verify web changes with
`typecheck` + `build:web` + the dev server (Playwright/Chromium is available),
and say explicitly in the PR when Kotlin changes could not be compiled locally.

## Invariants — do not break these

- **Bridge scope.** `addWebMessageListener` is registered only for
  `https://appassets.androidplatform.net` and ignores non-main-frame messages.
  Never widen the origin set, never add `addJavascriptInterface`, never enable
  `allowFileAccess`/`allowContentAccess`.
- **Threading.** SAF I/O and anything slow runs on `NativeBridge.io`; replies go
  through `resolve`/`reject`/`cancel`, which post to the main thread. Activity
  result launchers are registered at construction (before `STARTED`).
- **Request ids.** `id: 0` means fire-and-forget (`notify` in `native.ts`); any
  other id must receive exactly one reply. A superseded picker request is
  `cancel`led, not dropped.
- **Browser fallback.** Every `native.*` method must work (or reject cleanly)
  when `window.MarkTextAndroid` is absent, so `pnpm dev` keeps working.
- **Muya is shared.** Changes to editor behaviour belong in `packages/muya` and
  must not regress desktop (`packages/desktop`) — run muya's own tests
  (`pnpm --filter @muyajs/core test`) and label the Linear issue `muya`.
- **No data loss.** The draft must survive process death; a save must never
  silently overwrite content the user hasn't seen. Treat any change touching
  `session`, `save`, `Documents.writeText` as high-risk and test kill/relaunch.
- **Colours in two places.** `--app-surface` in `style.css` is mirrored by
  `SURFACE_LIGHT`/`SURFACE_DARK` in `NativeBridge.kt`; change both.
- **Back handling.** Anything that opens a layer (sheet, dialog, drawer, bar,
  mode) must be closable from `window.__mtHandleBack` in `main.ts`.
- **Welcome text** promises nothing is uploaded; don't add network features
  without an opt-in.

## Code style

- TypeScript: same as the repo (2-space, no semicolons, single quotes, strict).
  Interfaces are `I`-prefixed (`IDocument`), union types `T`-prefixed.
- Kotlin: official Kotlin style, 4-space indent, no wildcard imports.
- Comments follow `.github/COMMENTING-GUIDELINES.md`: explain *why*, not *what*.
- Keep the web layer dependency-free beyond `@muyajs/core` unless an issue
  explicitly calls for a library (e.g. CodeMirror in MAT-32); lazy-load large ones.

## Work tracking — Linear

All Android work is tracked in the Linear project **MarkText Android**
(team "Mat Argue", issue keys `MAT-n`):
https://linear.app/arguelab/project/marktext-android-60d33f0228d1

- **Milestones:** `M1 Reliability` → `M2 Workspace & images` →
  `M3 Android integration & design` → `M4 Polish & release`. Finish M1 before
  starting feature milestones unless the user says otherwise.
- **Labels:** one type (`Bug` / `Feature` / `Improvement`) plus areas
  (`android-web`, `android-shell`, `muya`, `ci`, `design`, `security`, `docs`).
- **Statuses:** Backlog → Todo → In Progress → In Review → Done.

Workflow for every change (the `/linear-task` skill automates this):
1. Find the Linear issue (or create one with type + area labels and a
   milestone). Set it **In Progress**, assigned to the user.
2. Develop on the branch the session assigns; if free to choose, use the
   issue's `gitBranchName`.
3. Keep the PR to the issue's scope. Anything else you notice → a new
   **Backlog** issue in the right milestone, not extra diff.
4. PR targets `develop` of `Marguements/marktext-android`; title/body mention
   the issue key (`MAT-n`) and the PR body links the issue. Move the issue to
   **In Review** and comment the PR link on it.
5. After merge, move the issue to **Done**. If scope or priorities changed,
   update `docs/ROADMAP.md` in the same or a follow-up PR.
