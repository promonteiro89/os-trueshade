# Changelog

All notable changes to TrueShade for OutSystems 11 and ODC are documented here. One version covers both libraries, which ship the same `Source/JS/TrueShade.js`. Versions follow [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-11-12

Fixes from a JavaScript audit of the shared script, with matching changes to the actions and the block in both libraries (O11 `TrueShade_Lib`, ODC `TrueShade`). No styling changes and no existing input or output removed: refresh the reference in consuming apps and republish them.

### Fixed

- `OnThemeChange` no longer stops firing after a screen change. Each `TrueShade` block keeps its own `OnChange` subscription, instead of sharing one global slot (`window.__TrueShadeThemeUnsub`) in which the next block replaced the previous one's, and its `OnDestroy` now calls `Dispose`.
- `Initialize` and the block raise `TrueShadeException` when the script fails to load, instead of an uncaught "TrueShade is not defined". The block now loads the script itself before initializing.
- `Dispose` called before the script has loaded does nothing, instead of throwing.
- `Dispose` undoes one `Initialize` instead of shutting TrueShade down for every caller: the listeners and `OnChange` subscriptions are removed only when the last caller disposes.
- After `Dispose`, the Get and Set actions keep using the application's storage key. Before, they fell back to the key derived from the URL, so a choice made then was saved under the wrong key and lost. The next `Initialize` still uses the name it is given; an empty name goes back to the key derived from the URL.
- A second `Initialize` with a different name, empty included, now logs a console warning; before, an empty name joining a named setup was silent. The block and every `Initialize` in an app should use the same `ApplicationName`.
- Before `Initialize`, the Get actions no longer write a default under a key that may still change, and `SetLayoutColorScheme` logs a warning.
- A message from another tab is checked against `localStorage`, so two tabs changing the theme at the same moment end up agreeing, and a stray message can no longer make a tab show a theme that isn't saved.
- Choosing the theme already in use saves it again if the stored value was cleared or changed elsewhere.
- When an `OnChange` callback changes the theme, the remaining callbacks and the other tabs no longer receive the older value afterwards.
- An unsubscribe function called twice no longer removes another subscription of the same callback.
- A callback calling `Initialize` during the first notification no longer opens a second cross-tab channel.
- Loading the script twice keeps the first copy instead of leaving it running unreachable.
- `SetLayoutColorScheme` with a non-text value (from JavaScript) logs an error instead of throwing.
- `Initialize` called again with the same application name no longer logs a warning.
- A failed save (storage full or blocked) logs a warning.
- The anti-flash snippet treats an invalid stored value as `system-default`, as the library does, so it no longer paints light first.

### Added

- `GetVersion` client action and `TrueShade.Theme.Version`, to check which script version a module holds.
- `Success` output on `LoadTrueShadeScript`: True when the script is loaded and ready.

### Changed

- `GetLayoutColorScheme` and `GetStoredLayoutColorScheme` return the script's value directly, without passing it through `TextToIdentifier`. The values are the same.
- The `Dispose` and `InitializeInBlock` descriptions describe the new behaviour.

### Tests

- The `BroadcastChannel` tests now really use `BroadcastChannel`; before, the fake was missing from the script's global scope and they ran through the `storage` fallback. The fake `storage` event fires only when the value changes, as in browsers.
- Tests for each fix above, and one that runs the anti-flash snippet and checks it agrees with the library.

## [2.0.0] - 2026-11-10

OutSystems UI v3 dark mode support. No action, input or output changes, but a major version because it changes how apps look: in an app on OutSystems UI v3, choosing dark (or `system-default` on a dark OS) now also switches OutSystems UI to its dark theme. Before, only CSS written against `data-theme` changed. Check custom CSS that was written for a light OutSystems UI under `[data-theme="dark"]`, since OutSystems UI's own dark tokens now apply on top of it. Apps without OutSystems UI v3 look the same as with 1.0.0.

### Added

- The `os-dark-theme` class is set on `<html>` when the theme in effect is dark and removed when it is light, next to the existing `data-theme` attribute. OutSystems UI v3 switches its design tokens to dark under this class, so OutSystems UI components now follow the TrueShade theme. TrueShade sets the class directly and still has no dependency on OutSystems UI; where nothing targets the class, it has no effect.
- The anti-flash `<head>` snippet in the script's header comment also sets the class.

### Tests

- New unit tests that run the script in a fake browser: theme values, the attribute and the class, OS changes, sync between tabs through `BroadcastChannel` and through the `storage` event, storage keys, `OnChange` and `Dispose`.

### Documentation

- This repository: the shared source for both libraries, with a checksum to confirm that each library holds exactly this script.

## [1.0.0]

- Initial release: `Initialize`, `SetLayoutColorScheme`, `GetLayoutColorScheme`, `GetStoredLayoutColorScheme`, `GetStorageKey`, `Dispose` and `LoadTrueShadeScript`; the `TrueShade` block with its `OnThemeChange` event; `TrueShadeException`.
