# MarkText for Android

A native Android app that runs MarkText's editor engine
([`@muyajs/core`](../muya)) in a WebView, with Android handling files,
sharing, the system bars and the keyboard.

## Install on your phone

1. Open the **Actions → Android** workflow run for the commit you want (or the
   `android-latest` pre-release once this has been merged to `develop`) and
   download the APK.
2. Open the APK on the phone. Android will ask you to allow installs from that
   app (browser or Files) the first time.
3. Every CI build is signed with the same key, so newer APKs install over older
   ones and keep your settings and recent files.

Needs Android 8.0 (API 26) or newer and a current Android System WebView.

## What it does

- WYSIWYG markdown editing: the same Muya engine as the desktop app (tables,
  task lists, KaTeX math, Mermaid/Vega/flowchart diagrams, code highlighting,
  front matter, footnotes, emoji).
- Open, save and save-as via the system file picker (local storage, SD card,
  Google Drive, Nextcloud and any other documents provider), plus a recent
  files list that survives restarts.
- "Open with MarkText" from file managers, and text shared from other apps
  opens as a new document.
- Formatting toolbar above the keyboard, including list indent/outdent (phone
  keyboards have no Tab key).
- Source-code mode, find & replace, outline, word count, HTML export, share.
- Light/dark theme following the system, auto-save, and hardware keyboard
  shortcuts (Ctrl+S, Ctrl+Shift+S, Ctrl+O, Ctrl+F, Ctrl+Alt+E).
- Your unsaved draft is kept if Android kills the app.

Images picked from the gallery are embedded as `data:` URLs because a
`content://` photo has no path relative to the markdown file.

## Layout

```
packages/android/
  package.json         pnpm workspace package "marktext-android" (web layer)
  vite.config.ts       builds web/ into app/src/main/assets/www/
  web/                 editor UI: index.html, src/*.ts (main.ts boots; native.ts is the bridge)
  settings.gradle.kts  Gradle project root (open this folder in Android Studio)
  app/                 Kotlin shell
    src/main/java/me/marktext/android/
      MainActivity.kt  WebView host, insets, back handling
      NativeBridge.kt  JS <-> Kotlin messages, file pickers, sharing
      Documents.kt     Storage Access Framework I/O
    marktext-dev.keystore  shared signing key for dev/CI builds (not a secret)
```

The page talks to Kotlin through `WebViewCompat.addWebMessageListener`,
limited to the app's own `https://appassets.androidplatform.net` origin.

Contributor docs: [`CLAUDE.md`](CLAUDE.md) (architecture and conventions),
[`docs/BRIDGE.md`](docs/BRIDGE.md), [`docs/DESIGN.md`](docs/DESIGN.md) and
[`docs/ROADMAP.md`](docs/ROADMAP.md). Work is tracked in the Linear project
[MarkText Android](https://linear.app/arguelab/project/marktext-android-60d33f0228d1).

## Build locally

Prerequisites: Node 22 + pnpm (see the repo root), JDK 17, and the Android SDK
(Android Studio installs it; set `ANDROID_HOME` or create
`packages/android/local.properties` with `sdk.dir=...`).

```bash
# from the repo root
pnpm install
pnpm --filter marktext-android build:web

cd packages/android
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug           # with the phone connected over USB/Wi-Fi ADB
```

The debug build installs next to the release build as `me.marktext.android.debug`,
and its WebView can be inspected from desktop Chrome at `chrome://inspect`.

To iterate on the UI without a phone, run `pnpm --filter marktext-android dev`
and open the page in a browser; file operations fall back to browser uploads and
downloads.

## Signing with your own key

CI signs release APKs with `app/marktext-dev.keystore` unless these repository
secrets exist: `MARKTEXT_KEYSTORE_BASE64` (the keystore, base64-encoded),
`MARKTEXT_KEYSTORE_PASSWORD`, `MARKTEXT_KEY_ALIAS` and `MARKTEXT_KEY_PASSWORD`.
Switching keys means uninstalling the previously installed build once.
