# TrueShade for OutSystems 11 and ODC

[![CI](https://github.com/promonteiro89/os-trueshade/actions/workflows/ci.yml/badge.svg)](https://github.com/promonteiro89/os-trueshade/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-OutSystems_11_%7C_ODC-red.svg)](https://www.outsystems.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-no_dependencies-f7df1e.svg)](Source/JS/TrueShade.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight OutSystems library for light, dark and system-default color schemes in Reactive Web and Mobile apps. It stores each user's choice per app, applies it to the page, follows the operating system's color scheme, and keeps open tabs in sync. It also drives OutSystems UI v3 dark mode, without depending on OutSystems UI.

The OutSystems 11 library (`TrueShade_Lib`) and the ODC library (`TrueShade`) share everything: the same JavaScript, client actions, block and exception. This repository holds that code once.

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [How the theme is applied](#how-the-theme-is-applied)
- [Action Reference](#action-reference)
  - [Client Actions](#client-actions)
  - [Block](#block)
  - [JavaScript API](#javascript-api)
- [Exceptions](#exceptions)
- [Build and Deployment](#build-and-deployment)
- [Testing](#testing)
- [Best Practices](#best-practices)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
Source/JS/
└── TrueShade.js          # The library script (TrueShade.Theme), identical in the O11 and ODC modules
tests/                    # Unit tests: the real script in a fake browser (node --test)
scripts/checksum.mjs      # Length + checksum, to confirm a module's copy matches Source/JS/TrueShade.js
```

| | OutSystems 11 | ODC |
|---|---|---|
| Library | `TrueShade_Lib` (Reactive library module) | `TrueShade` (library) |
| Script | `Scripts.TrueShade` | `Scripts.TrueShade` |

### Design notes

- One small, dependency-free script (`TrueShade.Theme`) holds all the logic. The client actions and the block are thin wrappers around it.
- The preference is stored in `localStorage`, per app: under `<ApplicationName>$layout-theme` when an application name is given, otherwise under `$OS_<first URL path segment>$layout-theme`. Giving several apps the same `ApplicationName` makes them share one preference.
- `system-default` follows the operating system and reacts when it changes. An explicit `dark` or `light` ignores the OS.
- Open tabs of the same app stay in sync through a `BroadcastChannel`, or through the `storage` event in browsers without one.
- The theme is applied to `<html>` as a `data-theme` attribute and as the OutSystems UI v3 `os-dark-theme` class (see [How the theme is applied](#how-the-theme-is-applied)). TrueShade sets the class itself, so it has no OutSystems UI reference.
- The script loads on demand (`RequireScript`) or through the block's required scripts, so a screen that doesn't use TrueShade doesn't load it.

---

## Prerequisites

- OutSystems 11 with Service Studio 11 (Reactive Web or Mobile apps), or ODC with ODC Studio.
- For OutSystems UI components to follow the theme: OutSystems UI v3 or later, whose dark mode is driven by the `os-dark-theme` class. With OutSystems UI 2.x, use `data-theme` in your own CSS.

---

## How the theme is applied

For the resolved theme (`dark` or `light`), TrueShade sets on `<html>`:

| What | Value | Used by |
|---|---|---|
| `data-theme` attribute | `dark` or `light` | Your own CSS, e.g. `[data-theme="dark"] .card { … }` |
| `os-dark-theme` class | Present only when dark | OutSystems UI v3 dark mode: its design tokens switch to dark under this class |

Where no CSS targets the class (OutSystems UI 2.x, or no OutSystems UI), it has no effect.

Don't call OutSystems UI's `SetDarkTheme` in an app that uses TrueShade. Both set the same class, so they would overwrite each other.

---

## Action Reference

Theme values are always one of `system-default`, `dark` or `light`.

### Client Actions

#### `Initialize`
Loads the script if needed, reads the stored preference (seeding `system-default` when there is none), applies it, and starts listening for OS and cross-tab changes. Calling it again does nothing; a different `ApplicationName` on a second call is ignored with a console warning.

| Parameter | Direction | Type | Description |
|---|---|---|---|
| `ApplicationName` | In | Text | Optional. Shares one stored preference across the apps that use the same name. Empty derives a name from the URL |

#### `SetLayoutColorScheme`
Stores and applies a theme immediately, and notifies the other open tabs.

| Parameter | Direction | Type | Description |
|---|---|---|---|
| `Theme` | In | Text | `system-default`, `dark` or `light`. Any other value is logged to the browser console and ignored |

#### `GetLayoutColorScheme`
Returns the theme in effect, with `system-default` resolved against the OS.

| Parameter | Direction | Type | Description |
|---|---|---|---|
| `Theme` | Out | Text | `dark` or `light` |

#### `GetStoredLayoutColorScheme`
Returns the stored preference as it is, without resolving `system-default`.

| Parameter | Direction | Type | Description |
|---|---|---|---|
| `Theme` | Out | Text | `system-default`, `dark` or `light` |

#### `GetStorageKey`
Returns the `localStorage` key in use, for debugging or for the [anti-flash snippet](#best-practices).

| Parameter | Direction | Type | Description |
|---|---|---|---|
| `StorageKey` | Out | Text | E.g. `myapp$layout-theme` or `$OS_MyApp$layout-theme` |

#### `Dispose`
Stops the OS and cross-tab listeners and resets the script's state. The stored preference and the theme already applied to the page stay as they are.

#### `LoadTrueShadeScript`
Loads the script if it isn't loaded yet. `Initialize` calls it; call it yourself only to load the script ahead of time.

### Block

#### `TrueShade`
Initializes TrueShade and reports theme changes. Place it once, in the layout or on the screen that needs it.

| Parameter / Event | Type | Description |
|---|---|---|
| `ApplicationName` | In, Text | Optional; same meaning as in `Initialize` |
| `OnThemeChange(Effective, Raw)` | Event | Fires once when the block is ready and on every change, whether it comes from the user, the OS or another tab. `Effective` is `dark` or `light`; `Raw` is the stored preference |

When the block is destroyed it only stops its notifications; the preference and the applied theme stay.

Use one `TrueShade` block per page. Block instances share a single notification slot, so a second instance (for example one in the layout and one on the screen) takes over the first one's `OnThemeChange`.

### JavaScript API

The script exposes `TrueShade.Theme`:

| Function | Returns | Description |
|---|---|---|
| `Initialize(appName?)` | – | As the client action |
| `SetLayoutColorScheme(theme)` | – | As the client action |
| `GetLayoutColorScheme()` | `'dark'` \| `'light'` | As the client action |
| `GetStoredLayoutColorScheme()` | Theme value | As the client action |
| `GetStorageKey()` | Text | As the client action |
| `OnChange(cb, { immediate })` | Unsubscribe function | Calls `cb(effective, raw)` on every change; with `immediate: true`, also once right away |
| `Dispose()` | – | As the client action |

---

## Exceptions

### `TrueShadeException`
Raised by `SetLayoutColorScheme`, `GetLayoutColorScheme`, `GetStoredLayoutColorScheme` and `GetStorageKey` when the script isn't loaded: "TrueShade is not defined. Please ensure the library is loaded correctly." Call `Initialize`, or place the `TrueShade` block, before using them.

---

## Build and Deployment

There is no build step: `Source/JS/TrueShade.js` is used as it is, as the `TrueShade` script of each library.

To release a change:

1. Put the new `Source/JS/TrueShade.js` into the `TrueShade` script of **both** libraries: `TrueShade_Lib` in Service Studio (O11) and `TrueShade` in ODC Studio.
2. Confirm that both copies match this repository (see [Testing](#testing)).
3. Publish both libraries: 1-Click Publish in Service Studio, Publish in ODC Studio.
4. In each consuming app, refresh the TrueShade dependency and publish the app. A library change reaches users only through an app that uses it.

---

## Testing

The test suite in [tests/](tests/) runs the real `Source/JS/TrueShade.js` in a fake browser and needs nothing but Node.js 20 or later:

```bash
npm test
```

It covers the theme values, the `data-theme` attribute and the `os-dark-theme` class, OS color-scheme changes, sync between tabs (both `BroadcastChannel` and the `storage` event), storage keys, `OnChange` and `Dispose`. See [tests/README.md](tests/README.md) for details.

To confirm that a module holds exactly this repository's script, compare checksums:

```bash
npm run checksum    # length=… checksum=…
```

For O11, this read-only probe through the Service Studio MCP server computes the same numbers for the open module. It saves nothing:

```csharp
eSpace => {
    var s = eSpace.Scripts.Named("TrueShade").JavaScript.Replace("\r\n", "\n");
    long h = 0; foreach (var c in s) h = (h * 31 + (long)c) % 2147483647;
    throw new Exception("PROBE:length=" + s.Length + " checksum=" + h);
}
```

For ODC, copy the script text into a file and run `node scripts/checksum.mjs <file>`.

---

## Best Practices

- Initialize TrueShade once per app, in the layout, with the `TrueShade` block or `Initialize`.
- Style dark mode through OutSystems UI's design tokens, or through your own CSS variables under `[data-theme="dark"]`, rather than by overriding component rules.
- Avoid a flash of the wrong theme: `Initialize` runs after the script loads, so the first paint can use the wrong theme. Set the theme synchronously in `<head>`, before any stylesheet, with the same storage key as your app. The snippet is in the header comment of `Source/JS/TrueShade.js` and sets both `data-theme` and `os-dark-theme`.
- Offer all three choices (System, Light, Dark) in your settings, and default to System.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and coding conventions.

---

## License

MIT. See [LICENSE](LICENSE).
