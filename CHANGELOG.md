# Changelog

All notable changes to TrueShade for OutSystems 11 and ODC are documented here. One version covers both libraries, which ship the same `Source/JS/TrueShade.js`. Versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-10

OutSystems UI v3 dark mode support. No action, input or output changes: a drop-in replacement for 1.0.0.

### Added

- The `os-dark-theme` class is set on `<html>` when the theme in effect is dark and removed when it is light, next to the existing `data-theme` attribute. OutSystems UI v3 switches its design tokens to dark under this class, so OutSystems UI components now follow the TrueShade theme. TrueShade sets the class directly and still has no dependency on OutSystems UI; where nothing targets the class, it has no effect.
- The anti-flash `<head>` snippet in the script's header comment also sets the class.

### Tests

- New unit tests that run the script in a fake browser: theme values, the attribute and the class, OS changes, sync between tabs through `BroadcastChannel` and through the `storage` event, storage keys, `OnChange` and `Dispose`.

### Documentation

- This repository: the shared source for both libraries, with a checksum to confirm that each library holds exactly this script.

## [1.0.0]

- Initial release: `Initialize`, `SetLayoutColorScheme`, `GetLayoutColorScheme`, `GetStoredLayoutColorScheme`, `GetStorageKey`, `Dispose` and `LoadTrueShadeScript`; the `TrueShade` block with its `OnThemeChange` event; `TrueShadeException`.
