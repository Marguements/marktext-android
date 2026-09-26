# Android UI & design guidelines

The app should feel like a native Android editor while sharing Muya's rendering
with the desktop app. These rules apply to every UI change in `web/` and to
shell code that affects what the user sees.

## Principles

1. **Writing first.** The document gets the space. Chrome is compact, quiet,
   and gets out of the way while typing (see MAT-27).
2. **Touch first, keyboard complete.** Every action is reachable by touch; every
   frequent action also has a hardware-keyboard shortcut (tablets, DeX,
   Chromebooks).
3. **Never lose words.** UI flows around saving, discarding and conflicts must be
   explicit and reversible where possible. Destructive actions confirm.
4. **Platform conventions.** Material 3 patterns: top app bar, navigation
   drawer, bottom sheets, snackbars. System back always closes the top layer.

## Tokens

All colours and sizes come from CSS custom properties in `web/src/style.css`:

- App chrome: `--app-bg`, `--app-surface`, `--app-fg`, `--app-muted`,
  `--app-border`, `--app-accent`, `--app-accent-soft`, `--app-pressed`,
  `--app-bar-height`, `--app-toolbar-height`.
- Muya tokens (`--editor-*`, `--theme-color`, `--float-*`, …) are overridden
  under `:root[data-theme='dark']`.
- Never hard-code a colour in a rule; add or reuse a token and define it for
  both `light` and `dark`.
- `--app-surface` is mirrored in `NativeBridge.kt` (`SURFACE_LIGHT` /
  `SURFACE_DARK`) because it shows through the transparent system bars. Keep
  them identical (MAT-28 plans to pass it over the bridge instead).

## Layout and insets

- The shell pads the root for system bars, display cutout and the IME
  (`MainActivity` insets listener), so the page never needs `env(safe-area-*)`.
  The formatting toolbar therefore always sits directly above the keyboard.
- Layout must hold from 320dp phones to tablets. Test at 360×800 and 1280×800.
  Tables and code blocks scroll horizontally inside the editor, never the page.
- On large screens cap the reading width rather than stretching text (MAT-30).

## Touch and focus

- Minimum touch target 48×48dp (some existing controls are 40–42px — fix when
  touched; tracked in MAT-29).
- Any button that acts on the editor must not steal focus: wrap it with
  `keepEditorFocus()` from `ui.ts` (prevents `pointerdown` default) or the
  selection collapses and the keyboard closes.
- Show pressed state with `--app-pressed`; show active formatting with
  `--app-accent-soft`.

## Layers: drawer, sheets, dialogs, bars

- Use the existing `openSheet(title, items)` bottom sheet for pickers and short
  menus; `<dialog>` with `.sheet` class for forms (see Settings).
- Every new layer must be closable by tapping its scrim/backdrop **and** by
  system back: add it to `window.__mtHandleBack` in `main.ts` in stacking
  order (topmost first).
- Snackbars (`toast()`) for confirmations; `window.confirm` only for
  irreversible choices until a proper confirm sheet exists.

## Icons and typography

- Icons are Material Symbols path data in `web/src/icons.ts`, rendered by
  `icon(name)` or `data-icon="name"` on a button. Add new icons there; don't
  pull in an icon font.
- Formatting buttons that are clearer as glyphs (B, I, S, `==`, `` ` ``) use
  text with a `tool-*` class.
- Editor font size and line height come from settings via Muya options; chrome
  uses the system font stack.

## Accessibility

- Every icon-only button has `aria-label` (and `title` for hover/long-press).
- Maintain WCAG AA contrast in both themes; check with Accessibility Scanner.
- Don't convey state by colour alone (e.g. dirty indicator also has
  `aria-label`, active toolbar state should also set `aria-pressed`).

## Dark mode

- Theme is `system | light | dark`; `applyTheme()` sets
  `document.documentElement.dataset.theme` and tells the shell to restyle the
  system bars. Anything new must look right in both before merge.
- Mermaid reads its theme at editor creation (`mermaidTheme` option).
