// Loads Source/JS/TrueShade.js into an isolated fake browser so the real script can be tested in Node.
// Each call to createTab() is one "browser tab"; tabs created from the same browser share
// localStorage, BroadcastChannel and the OS color-scheme preference, like real tabs do.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SOURCE = readFileSync(fileURLToPath(new URL('../Source/JS/TrueShade.js', import.meta.url)), 'utf8');

export function createBrowser({ osDark = false, broadcastChannel = true } = {}) {
    const store = new Map();
    const channels = new Map(); // name -> Set<FakeChannel>
    const mediaQueries = new Set();
    const tabs = [];
    let dark = osDark;

    function makeLocalStorage(tab) {
        return {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => {
                const oldValue = store.has(k) ? store.get(k) : null;
                store.set(k, String(v));
                // The 'storage' event fires in the OTHER tabs only, and only when the value changed.
                if (oldValue === String(v)) return;
                for (const other of tabs) {
                    if (other !== tab) other.dispatch('storage', { key: k, oldValue, newValue: String(v) });
                }
            },
            removeItem: (k) => store.delete(k),
        };
    }

    class FakeChannel {
        constructor(name) {
            this.name = name;
            this.listeners = new Set();
            this.closed = false;
            if (!channels.has(name)) channels.set(name, new Set());
            channels.get(name).add(this);
        }
        addEventListener(type, cb) { if (type === 'message') this.listeners.add(cb); }
        removeEventListener(type, cb) { if (type === 'message') this.listeners.delete(cb); }
        postMessage(data) {
            // Real BroadcastChannel never delivers to the sending instance.
            for (const ch of channels.get(this.name)) {
                if (ch !== this && !ch.closed) for (const cb of ch.listeners) cb({ data });
            }
        }
        close() { this.closed = true; channels.get(this.name).delete(this); }
    }

    function createTab({ pathname = '/MyApp/Home', hostname = 'tenant.outsystems.app' } = {}) {
        const classes = new Set();
        const windowListeners = new Map();
        const errors = [];
        const warnings = [];

        const mql = {
            get matches() { return dark; },
            listeners: new Set(),
            addEventListener(type, cb) { if (type === 'change') this.listeners.add(cb); },
            removeEventListener(type, cb) { if (type === 'change') this.listeners.delete(cb); },
        };
        mediaQueries.add(mql);

        const documentElement = {
            dataset: {},
            classList: {
                contains: (c) => classes.has(c),
                toggle: (c, force) => {
                    const on = force === undefined ? !classes.has(c) : force;
                    if (on) classes.add(c); else classes.delete(c);
                    return on;
                },
                add: (c) => classes.add(c),
                remove: (c) => classes.delete(c),
            },
        };

        const tab = {
            dispatch(type, evt) { for (const cb of windowListeners.get(type) || []) cb(evt); },
            get html() { return documentElement; },
            get classes() { return [...classes]; },
            errors,
            warnings,
        };

        const window = {
            location: { pathname, hostname },
            matchMedia: () => mql,
            addEventListener: (type, cb) => {
                if (!windowListeners.has(type)) windowListeners.set(type, new Set());
                windowListeners.get(type).add(cb);
            },
            removeEventListener: (type, cb) => windowListeners.get(type)?.delete(cb),
            listenerCount: (type) => windowListeners.get(type)?.size || 0,
        };
        if (broadcastChannel) window.BroadcastChannel = FakeChannel;

        // The script reads window.BroadcastChannel but constructs the global BroadcastChannel, as a
        // browser allows; both must exist or the script silently falls back to the 'storage' event.
        const context = vm.createContext({
            ...(broadcastChannel ? { BroadcastChannel: FakeChannel } : {}),
            window,
            document: { documentElement },
            localStorage: makeLocalStorage(tab),
            console: {
                error: (...a) => errors.push(a.join(' ')),
                warn: (...a) => warnings.push(a.join(' ')),
                log: () => {},
            },
        });
        vm.runInContext(SOURCE, context, { filename: 'TrueShade.js' });
        tab.Theme = vm.runInContext('TrueShade.Theme', context);
        tab.loadAgain = () => vm.runInContext(SOURCE, context, { filename: 'TrueShade.js' });
        tab.window = window;
        tab.mql = mql;
        tabs.push(tab);
        return tab;
    }

    return {
        createTab,
        store,
        channels,
        setOsDark(value) {
            dark = value;
            for (const mql of mediaQueries) for (const cb of mql.listeners) cb({ matches: value });
        },
    };
}
