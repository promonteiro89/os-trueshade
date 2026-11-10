# Contributing

## Getting started

1. Fork the repository and clone your fork.
2. Install Node.js 20 or later. There are no packages to install.
3. Run the tests:
   ```
   npm test
   ```

## Workflow

1. Create a branch from `master`:
   ```
   git checkout -b feature/short-description
   ```
2. Make the change in focused commits.
3. Check the script's syntax and run the tests: `npm run check` and `npm test`. All tests must pass.
4. Add the change to `CHANGELOG.md`.
5. Open a pull request against `master` that explains the change and why.

After a merge, the change is released to **both** platforms together, as described in [Build and Deployment](README.md#build-and-deployment).

## Code conventions

- The O11 and ODC libraries share one script. Change `Source/JS/TrueShade.js` only, never a module's copy alone, and keep the modules' actions, block, parameters and descriptions the same on both platforms.
- Plain browser JavaScript with no dependencies and no build step. Keep it working in the browsers OutSystems supports, including older Safari (`addListener` on media queries) and environments without `matchMedia`, `BroadcastChannel` or `localStorage`.
- No dependency on OutSystems UI. TrueShade sets the `os-dark-theme` class itself.
- Match the existing style: 4-space indentation, JSDoc on every public function, constants in `CONSTS`.
- Add or update a test in `tests/theme.test.mjs` for every behaviour change.

## Dependencies

None. The library uses only browser APIs, and the tests use only Node's built-in test runner.

## Reporting issues

Include:
- the TrueShade version or commit;
- the platform (OutSystems 11 or ODC) and, if relevant, the OutSystems UI version;
- the browser and operating system;
- the action used, its inputs, and the full error message or unexpected behaviour.

## License

Contributions are licensed under the [MIT License](LICENSE).
