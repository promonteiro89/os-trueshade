/**
 * TrueShade.Theme
 *
 * Purpose:
 * - Manage the UI color scheme (dark/light) using a small, dependency-free module.
 * - Persists a per-module preference in localStorage and reflects it on <html data-theme> and on the
 *   os-dark-theme class of <html> (OutSystems UI v3 dark mode; no dependency on OutSystems UI).
 *
 * Lifecycle:
 * - Initialize(appName): reads preference (or seeds to 'system-default'), applies it, and wires listeners.
 * - Reacts to: OS color scheme changes and cross-tab updates. Cross-tab sync uses a per-module
 *   BroadcastChannel when available, falling back to the 'storage' event (filtered by our storage key)
 *   on browsers without BroadcastChannel support.
 * - Dispose(): undoes one Initialize(). The listeners are removed when the last caller disposes; the saved
 *   preference and the app name are kept, so Get/Set after Dispose still use the same storage key.
 *
 * Storage key format:
 * - If Initialize is called with an appName, that exact appName is used as the module id; key => "<appName>$layout-theme" (no $OS_ prefix).
 * - Otherwise getModuleName() returns a module id like "$OS_<name>$"; the full key is "$OS_<name>$layout-theme".
 * - Values: 'system-default' | 'dark' | 'light'.
 *
 * Preventing FOUC (flash of the wrong theme):
 * - This module applies the theme during Initialize(), which runs after the script loads, so the
 *   page can paint once in the wrong theme before it takes over. To avoid that flash, set data-theme
 *   synchronously in <head>, BEFORE any stylesheet/body, using the same storage key as your app.
 *   Replace 'myapp' below with the appName you pass to Initialize():
 *
 *     <script>
 *       (function () {
 *         try {
 *           var raw = localStorage.getItem('myapp$layout-theme');
 *           if (raw !== 'dark' && raw !== 'light') raw = 'system-default';
 *           var dark = raw === 'dark' ||
 *             (raw === 'system-default' && matchMedia('(prefers-color-scheme: dark)').matches);
 *           document.documentElement.dataset.theme = dark ? 'dark' : 'light';
 *           document.documentElement.classList.toggle('os-dark-theme', dark);
 *         } catch (e) { document.documentElement.dataset.theme = 'light'; }
 *       })();
 *     </script>
 *
 *   Initialize() will then resolve to the same value and skip the redundant DOM write.
 */
var TrueShade;
(function (TrueShade) {
    'use strict';
    var Theme;
    (function (Theme) {
        // Loaded twice (e.g. from two URLs): keep the first copy, whose listeners and state are live.
        if (Theme.Initialize) return;
        /** @typedef {'system-default'|'dark'|'light'} ThemeMode */
        const CONSTS = Object.freeze({
            STORAGE_KEY_SUFFIX: 'layout-theme',
            MODES: Object.freeze({
                DEFAULT: 'system-default',
                DARK: 'dark',
                LIGHT: 'light'
            }),
            DATASET_ATTR: 'theme',          // <html data-theme>
            DARK_THEME_CLASS: 'os-dark-theme', // <html class> read by OutSystems UI v3 dark mode
            CHANNEL_PREFIX: 'trueshade-theme-'
        });

        const htmlElement = document.documentElement;
        // Guard against environments without matchMedia (old/stripped webviews, some test harnesses):
        // degrade to "light, no OS reactivity" instead of throwing at load.
        const prefersDarkScheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')) ||
            { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };

        function isMode(t) {
            return t === CONSTS.MODES.DEFAULT || t === CONSTS.MODES.DARK || t === CONSTS.MODES.LIGHT;
        }

        // 'system-default' resolves to the live OS preference; explicit values pass through.
        function resolve(raw) {
            return raw === CONSTS.MODES.DEFAULT
                ? (prefersDarkScheme.matches ? CONSTS.MODES.DARK : CONSTS.MODES.LIGHT)
                : raw;
        }

        // Older Safari (<14) exposes addListener/removeListener instead of add/removeEventListener.
        function addSchemeListener(cb) {
            if (prefersDarkScheme.addEventListener) prefersDarkScheme.addEventListener('change', cb);
            else if (prefersDarkScheme.addListener) prefersDarkScheme.addListener(cb);
        }
        function removeSchemeListener(cb) {
            if (prefersDarkScheme.removeEventListener) prefersDarkScheme.removeEventListener('change', cb);
            else if (prefersDarkScheme.removeListener) prefersDarkScheme.removeListener(cb);
        }

        let _initialized = false;
        let _initCount = 0;                    // Initialize() calls not yet matched by Dispose()
        /** @type {BroadcastChannel|null} */
        let _channel = null;
        let _usingStorageFallback = false;     // true when syncing via 'storage' event (no BroadcastChannel)
        /** @type {Array<(effective:string, raw:string)=>void>} listeners (1-arg callbacks also work) */
        const _listeners = [];
        let _moduleName = '';                  // cached "$OS_<name>$" ('' if none derivable)
        let _moduleNameComputed = false;       // so an empty derivation is cached too
        let _storageKey = '';
        let _explicitModuleName = '';          // set by Initialize(appName)
        /** @type {ThemeMode|null} */
        let _rawTheme = null;                  // persisted preference; null until seeded
        // Last (effective, raw) delivered to listeners; null until first emit (drives dedupe in emit()).
        let _lastEffective = null;
        let _lastRaw = null;

        // e.g. "$OS_example$layout-theme" (derived) or "myapp$layout-theme" (explicit appName).
        function getStorageKey() {
            if (_storageKey) return _storageKey;
            const base = _explicitModuleName || getModuleName();
            // Explicit names need the '$' separator added; a derived base is already "$OS_<name>$".
            _storageKey = _explicitModuleName
                ? base + '$' + CONSTS.STORAGE_KEY_SUFFIX
                : base + CONSTS.STORAGE_KEY_SUFFIX;
            return _storageKey;
        }

        // Returns the stored preference; a missing or invalid value becomes DEFAULT and is written back
        // once initialized (before Initialize() the key may still change, so nothing is written).
        // Falls back to DEFAULT on storage errors (e.g. privacy mode). Never returns null.
        function ensureSeeded() {
            if (_rawTheme) return _rawTheme;
            const theme = CONSTS.MODES.DEFAULT;
            const key = getStorageKey();
            try {
                const existing = localStorage.getItem(key);
                if (isMode(existing)) {
                    _rawTheme = existing;
                    return _rawTheme;
                }
                if (_initialized) localStorage.setItem(key, theme);
            } catch (_) { /* keep default */ }
            _rawTheme = theme;
            return _rawTheme;
        }

        // Sets <html data-theme> and the os-dark-theme class to the resolved value, skipping unchanged writes.
        function applyTheme(rawTheme) {
            const resolved = resolve(rawTheme);
            const attr = CONSTS.DATASET_ATTR;
            // OutSystems UI v3 switches its tokens to dark under <html class="os-dark-theme">. The class is
            // toggled here directly, so TrueShade needs no OutSystems UI reference; without CSS that targets
            // it, the class has no effect.
            const isDark = resolved === CONSTS.MODES.DARK;
            if (htmlElement.classList.contains(CONSTS.DARK_THEME_CLASS) !== isDark) {
                htmlElement.classList.toggle(CONSTS.DARK_THEME_CLASS, isDark);
            }
            if (htmlElement.dataset[attr] !== resolved) {
                htmlElement.dataset[attr] = resolved;
            }
        }

        // source: 'init' | 'os-change' | 'local-set' | 'remote'
        function emit(rawTheme, source) {
            const effective = resolve(rawTheme);
            if (effective !== _lastEffective || rawTheme !== _lastRaw) {
                _lastEffective = effective;
                _lastRaw = rawTheme;
                // Snapshot: a callback may unsubscribe/subscribe mid-dispatch.
                const snapshot = _listeners.slice();
                for (let i = 0; i < snapshot.length; i++) {
                    try { snapshot[i](effective, rawTheme); } catch (e) { console.error('TrueShade.Theme: OnChange listener threw', e); }
                    // A listener changed the theme (a nested emit already delivered and broadcast the
                    // newer value) or disposed: stop, so nobody receives or broadcasts the stale one.
                    if (_lastEffective !== effective || _lastRaw !== rawTheme) return;
                }
            }
            // Only local user changes need broadcasting; other tabs observe OS changes themselves
            // and already share the persisted value on init/remote.
            if (_channel && source === 'local-set') {
                try { _channel.postMessage({ type: 'theme-change', theme: rawTheme, v: 1 }); } catch (_) { /* ignore */ }
            }
        }

        // On an OS flip, only 'system-default' has an effective change to repaint/announce;
        // an explicit theme re-applies as a no-op.
        function onColorSchemeChange() {
            if (!_rawTheme) ensureSeeded();
            applyTheme(_rawTheme);
            if (_rawTheme === CONSTS.MODES.DEFAULT) emit(_rawTheme, 'os-change');
        }

        // Cross-tab handlers. The sending tab already persisted the value, so receivers only
        // update memory + DOM ('remote' tells emit() not to re-broadcast).
        function applyRemote(t) {
            if (!isMode(t) || t === _rawTheme) return;
            _rawTheme = t;
            applyTheme(t);
            emit(t, 'remote');
        }

        // A message only signals a change: localStorage holds the value, so two tabs changing the theme at
        // once still converge, and a stray message can't make this tab disagree with what is saved.
        function onChannelMessage(evt) {
            const msg = evt && evt.data;
            if (!msg || msg.type !== 'theme-change' || msg.v !== 1 || !isMode(msg.theme)) return;
            let t = msg.theme;
            try {
                const stored = localStorage.getItem(getStorageKey());
                if (isMode(stored)) t = stored;
            } catch (_) { /* storage unavailable: trust the message */ }
            applyRemote(t);
        }

        // Fallback transport: fires in OTHER tabs when our storage key changes.
        function onStorageChange(evt) {
            if (!evt || evt.key !== getStorageKey()) return;
            applyRemote(evt.newValue);
        }

        // -------------------------
        // Public APIs
        // -------------------------
        /**
         * Initializes the theme system (idempotent).
         * Optional appName lets multiple front-ends share one stored preference by using the exact
         * name given; if omitted, a name is derived from the URL as "$OS_<name>$" (see getModuleName()).
         * Seeds the preference to 'system-default' when missing, applies the current theme to <html>,
         * and wires the OS and cross-tab listeners.
         * @param {string} [appName] Explicit shared name for the storage key prefix & channel id.
         * @returns {void}
         */
        function initialize(appName) {
            // Strip a trailing '$' so 'myapp' and 'myapp$' produce the same key.
            const name = typeof appName === 'string' ? appName.trim().replace(/\$+$/, '') : '';
            if (_initialized) {
                _initCount++;
                // Joining a running setup keeps its name and storage key. A different name, empty included,
                // means one app uses two names: the block and every Initialize in an app must share one.
                if (name !== _explicitModuleName) {
                    console.warn('TrueShade.Theme: Initialize() already called; ignoring appName "' +
                        name + '" and keeping "' + _explicitModuleName + '" (empty = derived from the URL).' +
                        ' Use the same ApplicationName for the block and every Initialize in an app.');
                }
                return;
            }
            // A fresh Initialize always takes its own name; an empty one means the key derived from the
            // URL. (Dispose keeps the previous name only so Get/Set between Dispose and Initialize agree.)
            if (name !== _explicitModuleName) {
                _explicitModuleName = name;
                _storageKey = '';
            }
            _rawTheme = null; // re-read: a call before Initialize() may have cached an unseeded default
            // Set before the first emit, so a listener that calls Initialize() again doesn't wire twice.
            _initialized = true;
            _initCount = 1;
            const theme = ensureSeeded();
            applyTheme(theme);
            addSchemeListener(onColorSchemeChange);
            if (window.BroadcastChannel) {
                try {
                    const channelName = CONSTS.CHANNEL_PREFIX + (_explicitModuleName || getModuleName());
                    _channel = new BroadcastChannel(channelName);
                    _channel.addEventListener('message', onChannelMessage);
                } catch (_) { _channel = null; }
            }
            // No BroadcastChannel (or it threw): fall back to the shared-localStorage 'storage' event.
            if (!_channel) {
                window.addEventListener('storage', onStorageChange);
                _usingStorageFallback = true;
            }
            emit(theme, 'init');
        }

        /**
         * Returns the effective color scheme, resolving 'system-default' to the current OS preference.
         * @returns {'dark'|'light'}
         */
        function getLayoutColorScheme() {
            return resolve(ensureSeeded());
        }

        /**
         * Returns the raw stored preference (guaranteed seeded).
         * Never returns null; seeds to 'system-default' if key was missing.
         * @returns {ThemeMode}
         */
        function getStoredLayoutColorScheme() { return ensureSeeded(); }

        /**
         * Sets and applies the layout color scheme.
         * - Accepts only 'system-default' | 'dark' | 'light'; logs an error for invalid values.
         * - Persists to localStorage and applies immediately.
         * - Before Initialize() it warns: the storage key may still change when Initialize(appName) runs.
         * @param {ThemeMode} theme
         * @returns {void}
         */
        function setLayoutColorScheme(theme) {
            if (!isMode(theme)) {
                // String() would throw for a Symbol or a prototype-less object.
                console.error('Invalid theme: ' + (typeof theme === 'string' ? theme.slice(0, 64) : typeof theme));
                return;
            }
            if (!_initialized) {
                console.warn('TrueShade.Theme: SetLayoutColorScheme() called before Initialize(); saving under "' +
                    getStorageKey() + '".');
            }
            const changed = _rawTheme !== theme;
            _rawTheme = theme;
            // Written even when unchanged in memory: storage may have been cleared or changed elsewhere.
            try {
                const key = getStorageKey();
                if (localStorage.getItem(key) !== theme) localStorage.setItem(key, theme);
            } catch (e) {
                console.warn('TrueShade.Theme: could not save the theme; it will not survive a reload.', e);
            }
            if (!changed) return;
            applyTheme(theme);
            emit(theme, 'local-set');
        }

        /**
         * Undoes one Initialize() (idempotent once fully disposed). When the last caller disposes, it removes
         * the OS and cross-tab listeners and every OnChange subscription. The persisted preference, the theme
         * on <html> and the app name are kept, so Get/Set keep using the same storage key.
         * @returns {void}
         */
        function dispose() {
            if (_initCount > 1) { _initCount--; return; }
            _initCount = 0;
            removeSchemeListener(onColorSchemeChange);
            if (_channel) {
                try { _channel.removeEventListener('message', onChannelMessage); _channel.close(); } catch (_) { /* ignore */ }
                _channel = null;
            }
            if (_usingStorageFallback) { window.removeEventListener('storage', onStorageChange); _usingStorageFallback = false; }
            _listeners.length = 0;
            _lastEffective = null;
            _lastRaw = null;
            _rawTheme = null;               // re-read from storage on the next call
            _initialized = false;
        }

        /**
         * Subscribes to theme changes.
         * Callback receives two arguments:
         *  - effective: 'dark'|'light' (resolved current theme)
         *  - raw: 'system-default'|'dark'|'light' (stored preference)
         * For backward compatibility, existing callbacks that only expect one param continue to work.
         * By default the callback fires only on future changes. Pass { immediate: true } to also
         * fire once synchronously with the current theme. When subscribing before Initialize(), the
         * immediate fire is skipped — Initialize()'s first emit delivers it, so it still runs once.
         * @param {(effective:string, raw:string) => void} cb
         * @param {{ immediate?: boolean }} [opts]
         * @returns {() => void} Unsubscribe function.
         */
        function onChange(cb, opts) {
            if (typeof cb !== 'function') return () => { };
            _listeners.push(cb);
            if (opts && opts.immediate && _initialized) {
                const raw = ensureSeeded();
                try { cb(resolve(raw), raw); } catch (e) { console.error('TrueShade.Theme: OnChange listener threw', e); }
            }
            let active = true;
            return function unsubscribe() {
                // Once only: a second call must not remove another subscription of the same callback.
                if (!active) return;
                active = false;
                const idx = _listeners.indexOf(cb);
                if (idx > -1) _listeners.splice(idx, 1);
            };
        }

        // Expose public API
        Theme.Version = '2.1.0';
        Theme.Initialize = initialize;
        Theme.GetLayoutColorScheme = getLayoutColorScheme;
        Theme.GetStoredLayoutColorScheme = getStoredLayoutColorScheme;
        Theme.SetLayoutColorScheme = setLayoutColorScheme;
        Theme.Dispose = dispose;
        Theme.OnChange = onChange;
        Theme.GetStorageKey = getStorageKey;

        // -------------------------
        // Utils
        // -------------------------
        /**
         * Derives a compact module id from the current URL and wraps it as "$OS_<name>$".
         * - First non-empty path segment wins; otherwise the first hostname label; else fallback.
         * - Result is cached after the first call; the fallback/loc arguments are honored only on
         *   that first (uncached) call. The URL's first segment doesn't change in a SPA, so the cache
         *   survives Dispose().
         * @param {string} [fallback]
         * @param {{ pathname: string, hostname: string }} [loc]
         * @returns {string}
         */
        function getModuleName(fallback = '', loc = window.location) {
            if (_moduleNameComputed) return _moduleName;
            let name = (loc.pathname || '').split('/').filter(Boolean)[0] || '';
            if (!name) name = (loc.hostname || '').replace(/^\.+/, '').split('.')[0] || '';
            if (!name) name = fallback;
            _moduleName = name ? '$OS_' + name + '$' : '';
            _moduleNameComputed = true;
            return _moduleName;
        }

    })(Theme = TrueShade.Theme || (TrueShade.Theme = {}));
})(TrueShade || (TrueShade = {}));
