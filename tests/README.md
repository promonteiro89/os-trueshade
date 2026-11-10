# Test Suite

Tests the library script, `Source/JS/TrueShade.js`. It needs Node.js 20 or later and nothing else: no browser, no packages, no OutSystems environment.

## How it works

- [harness.mjs](harness.mjs) loads the real script into an isolated Node `vm` context with a fake browser: `document.documentElement` (with `dataset` and `classList`), `localStorage`, `matchMedia`, `BroadcastChannel`, `window` events and `console`.
- One fake browser can open several tabs. Like real tabs, they share `localStorage`, `BroadcastChannel` and the OS color-scheme preference, and a `localStorage` write fires the `storage` event in the other tabs only. A `BroadcastChannel` message never reaches the tab that sent it.
- The OS preference can be flipped during a test, which fires the media query's `change` listeners as a real OS switch does.
- [theme.test.mjs](theme.test.mjs) drives the script only through its public API, `TrueShade.Theme`, the same functions the client actions call.

## Running

```bash
npm test                     # all tests
npm run check                # syntax check of the script
npm run checksum             # length and checksum of the script, to compare with a module's copy
```

## Coverage

| Area | What's checked |
|---|---|
| `Initialize` | Seeds `system-default` when nothing is stored; applies the theme at once; a second call with another `ApplicationName` is ignored with a warning |
| Theme values | `system-default` resolves against the OS; `dark` and `light` ignore it; an invalid value logs an error and changes nothing |
| `<html>` | `data-theme` is `dark` or `light`; the `os-dark-theme` class is present only when dark, and removed when switching to light |
| `SetLayoutColorScheme` | The value is stored in `localStorage` under the app's key and applied immediately |
| OS changes | A switch repaints and notifies `OnChange` while on `system-default`; with an explicit theme, nothing changes and no notification is sent |
| Storage key | `<ApplicationName>$layout-theme` (a trailing `$` in the name is ignored); `$OS_<first path segment>$layout-theme` without a name |
| Sync between tabs | A change in one tab is applied in another, through `BroadcastChannel`, and through the `storage` event when `BroadcastChannel` is missing |
| `OnChange` | `immediate: true` fires once right away; the returned function unsubscribes |
| `Dispose` | Removes the OS and `storage` listeners; keeps the stored preference, `data-theme` and the class |

## Limits

- The fake browser models only the APIs the script uses. Real-browser behaviour (rendering, real cross-tab timing, `BroadcastChannel` delivery order) is not tested here.
- The OutSystems wrappers (client actions, the `TrueShade` block, `TrueShadeException`) are not covered. Check them in an app that uses the library after publishing.
