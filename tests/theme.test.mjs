import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createBrowser } from './harness.mjs';

const DARK_CLASS = 'os-dark-theme';

test('Initialize seeds system-default and follows a light OS', () => {
    const tab = createBrowser({ osDark: false }).createTab();
    tab.Theme.Initialize('myapp');
    assert.equal(tab.Theme.GetStoredLayoutColorScheme(), 'system-default');
    assert.equal(tab.Theme.GetLayoutColorScheme(), 'light');
    assert.equal(tab.html.dataset.theme, 'light');
    assert.ok(!tab.classes.includes(DARK_CLASS));
});

test('system-default on a dark OS sets data-theme and os-dark-theme', () => {
    const tab = createBrowser({ osDark: true }).createTab();
    tab.Theme.Initialize('myapp');
    assert.equal(tab.html.dataset.theme, 'dark');
    assert.ok(tab.classes.includes(DARK_CLASS));
});

test('SetLayoutColorScheme persists and toggles the OutSystems UI dark class', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');

    tab.Theme.SetLayoutColorScheme('dark');
    assert.equal(browser.store.get('myapp$layout-theme'), 'dark');
    assert.equal(tab.html.dataset.theme, 'dark');
    assert.ok(tab.classes.includes(DARK_CLASS));

    tab.Theme.SetLayoutColorScheme('light');
    assert.equal(browser.store.get('myapp$layout-theme'), 'light');
    assert.equal(tab.html.dataset.theme, 'light');
    assert.ok(!tab.classes.includes(DARK_CLASS));
});

test('an invalid value logs an error and changes nothing', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.SetLayoutColorScheme('blue');
    assert.equal(tab.Theme.GetStoredLayoutColorScheme(), 'system-default');
    assert.equal(tab.errors.length, 1);
    assert.match(tab.errors[0], /Invalid theme: blue/);
});

test('an OS flip repaints and notifies only while on system-default', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');
    const seen = [];
    tab.Theme.OnChange((effective, raw) => seen.push(`${effective}/${raw}`));

    browser.setOsDark(true);
    assert.equal(tab.html.dataset.theme, 'dark');
    assert.ok(tab.classes.includes(DARK_CLASS));
    assert.deepEqual(seen, ['dark/system-default']);

    tab.Theme.SetLayoutColorScheme('light');
    browser.setOsDark(false);
    browser.setOsDark(true);
    assert.equal(tab.html.dataset.theme, 'light');
    assert.ok(!tab.classes.includes(DARK_CLASS));
    assert.deepEqual(seen, ['dark/system-default', 'light/light']);
});

test('storage key: explicit appName vs derived from the URL', () => {
    const explicit = createBrowser().createTab();
    explicit.Theme.Initialize('myapp$');
    assert.equal(explicit.Theme.GetStorageKey(), 'myapp$layout-theme');

    const derived = createBrowser().createTab({ pathname: '/TrueShade/Home' });
    derived.Theme.Initialize();
    assert.equal(derived.Theme.GetStorageKey(), '$OS_TrueShade$layout-theme');
});

test('a change in one tab reaches the other tabs (BroadcastChannel)', () => {
    const browser = createBrowser({ osDark: false });
    const a = browser.createTab();
    const b = browser.createTab();
    a.Theme.Initialize('myapp');
    b.Theme.Initialize('myapp');
    // The channel is really in use, not the storage-event fallback.
    assert.equal(b.window.listenerCount('storage'), 0);
    const seen = [];
    b.Theme.OnChange((effective, raw) => seen.push(`${effective}/${raw}`));

    a.Theme.SetLayoutColorScheme('dark');
    assert.equal(b.html.dataset.theme, 'dark');
    assert.ok(b.classes.includes(DARK_CLASS));
    assert.equal(b.Theme.GetStoredLayoutColorScheme(), 'dark');
    assert.deepEqual(seen, ['dark/dark']);
});

test('a change in one tab reaches the other tabs (storage-event fallback)', () => {
    const browser = createBrowser({ osDark: false, broadcastChannel: false });
    const a = browser.createTab();
    const b = browser.createTab();
    a.Theme.Initialize('myapp');
    b.Theme.Initialize('myapp');
    assert.equal(b.window.listenerCount('storage'), 1);

    a.Theme.SetLayoutColorScheme('dark');
    assert.equal(b.html.dataset.theme, 'dark');
    assert.ok(b.classes.includes(DARK_CLASS));
});

test('Dispose removes listeners but keeps the preference and the applied theme', () => {
    const browser = createBrowser({ osDark: false, broadcastChannel: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.SetLayoutColorScheme('dark');

    tab.Theme.Dispose();
    assert.equal(tab.window.listenerCount('storage'), 0);
    assert.equal(tab.mql.listeners.size, 0);
    assert.equal(browser.store.get('myapp$layout-theme'), 'dark');
    assert.equal(tab.html.dataset.theme, 'dark');
    assert.ok(tab.classes.includes(DARK_CLASS));
});

test('OnChange with immediate fires once now and returns an unsubscribe', () => {
    const tab = createBrowser({ osDark: true }).createTab();
    tab.Theme.Initialize('myapp');
    const seen = [];
    const unsubscribe = tab.Theme.OnChange((effective, raw) => seen.push(`${effective}/${raw}`), { immediate: true });
    assert.deepEqual(seen, ['dark/system-default']);

    unsubscribe();
    tab.Theme.SetLayoutColorScheme('light');
    assert.deepEqual(seen, ['dark/system-default']);
});

test('a second Initialize with another appName is ignored with a warning', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('first');
    tab.Theme.Initialize('second');
    assert.equal(tab.Theme.GetStorageKey(), 'first$layout-theme');
    assert.equal(tab.warnings.length, 1);
});

test('a second Initialize with the same appName does not warn', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.Initialize('myapp$');
    tab.Theme.Initialize(' myapp ');
    assert.equal(tab.warnings.length, 0);

    const other = createBrowser().createTab();
    other.Theme.Initialize();
    other.Theme.Initialize('');
    assert.equal(other.warnings.length, 0);
});

test('an empty name joining a named setup (or the reverse) warns and keeps the first key', () => {
    // A screen's Initialize('manual') is still live when the next screen's block (empty name) is ready.
    const tab = createBrowser().createTab({ pathname: '/MyApp/Home' });
    tab.Theme.Initialize('manual');
    tab.Theme.Initialize('');
    tab.Theme.Dispose();
    assert.equal(tab.Theme.GetStorageKey(), 'manual$layout-theme');
    assert.equal(tab.warnings.length, 1);

    const rev = createBrowser().createTab({ pathname: '/MyApp/Home' });
    rev.Theme.Initialize();
    rev.Theme.Initialize('manual');
    assert.equal(rev.Theme.GetStorageKey(), '$OS_MyApp$layout-theme');
    assert.equal(rev.warnings.length, 1);
});

test('Dispose undoes one Initialize: other subscribers keep working until the last Dispose', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');          // block A
    tab.Theme.Initialize('myapp');          // block B
    const seenB = [];
    tab.Theme.OnChange((effective) => seenB.push(effective));

    tab.Theme.Dispose();                    // block A goes away
    browser.setOsDark(true);
    assert.equal(tab.html.dataset.theme, 'dark');
    assert.deepEqual(seenB, ['dark']);
    assert.equal(tab.mql.listeners.size, 1);

    tab.Theme.Dispose();                    // block B goes away: full teardown
    assert.equal(tab.mql.listeners.size, 0);
    assert.equal(browser.channels.get('trueshade-theme-myapp').size, 0);
    tab.Theme.Dispose();                    // extra Dispose is harmless
});

test('after Dispose, Get and Set keep using the app storage key', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('shared');
    tab.Theme.SetLayoutColorScheme('dark');
    tab.Theme.Dispose();

    assert.equal(tab.Theme.GetStorageKey(), 'shared$layout-theme');
    assert.equal(tab.Theme.GetStoredLayoutColorScheme(), 'dark');
    tab.Theme.SetLayoutColorScheme('light');
    assert.equal(browser.store.get('shared$layout-theme'), 'light');
    assert.deepEqual([...browser.store.keys()], ['shared$layout-theme']);

    tab.Theme.Initialize('shared');
    assert.equal(tab.html.dataset.theme, 'light');
});

test('a new Initialize after Dispose uses its own name, empty included', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab({ pathname: '/MyApp/Home' });
    tab.Theme.Initialize('manual');
    tab.Theme.Dispose();

    // An empty name (the block's default) goes back to the key derived from the URL.
    tab.Theme.Initialize('');
    assert.equal(tab.Theme.GetStorageKey(), '$OS_MyApp$layout-theme');
    tab.Theme.Dispose();

    tab.Theme.Initialize();
    assert.equal(tab.Theme.GetStorageKey(), '$OS_MyApp$layout-theme');
    tab.Theme.Dispose();

    tab.Theme.Initialize('other');
    assert.equal(tab.Theme.GetStorageKey(), 'other$layout-theme');
});

test('before Initialize, Get writes nothing and Set warns', () => {
    const browser = createBrowser();
    const tab = browser.createTab();
    assert.equal(tab.Theme.GetStoredLayoutColorScheme(), 'system-default');
    assert.equal(browser.store.size, 0);

    tab.Theme.SetLayoutColorScheme('dark');
    assert.equal(tab.warnings.length, 1);
    assert.match(tab.warnings[0], /before Initialize/);

    // Initialize re-reads storage under its own key and seeds it.
    tab.Theme.Initialize('myapp');
    assert.equal(browser.store.get('myapp$layout-theme'), 'system-default');
});

test('an invalid stored value is replaced by system-default on Initialize', () => {
    const browser = createBrowser({ osDark: true });
    browser.store.set('myapp$layout-theme', 'Dark');
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');
    assert.equal(browser.store.get('myapp$layout-theme'), 'system-default');
    assert.equal(tab.html.dataset.theme, 'dark');
});

test('a listener that changes the theme stops the stale dispatch and broadcast', () => {
    const browser = createBrowser({ osDark: false });
    const a = browser.createTab();
    const b = browser.createTab();
    a.Theme.Initialize('myapp');
    b.Theme.Initialize('myapp');
    a.Theme.OnChange((effective) => { if (effective === 'dark') a.Theme.SetLayoutColorScheme('light'); });
    const later = [];
    a.Theme.OnChange((effective) => later.push(effective));

    a.Theme.SetLayoutColorScheme('dark');
    assert.deepEqual(later, ['light']);
    assert.equal(browser.store.get('myapp$layout-theme'), 'light');
    assert.equal(a.html.dataset.theme, 'light');
    assert.equal(b.html.dataset.theme, 'light');
});

test('a cross-tab message is checked against storage, which wins', () => {
    const browser = createBrowser({ osDark: false });
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.SetLayoutColorScheme('light');
    // A stray or stale message disagreeing with what is saved.
    const [ch] = browser.channels.get('trueshade-theme-myapp');
    for (const cb of ch.listeners) cb({ data: { type: 'theme-change', theme: 'dark', v: 1 } });
    assert.equal(tab.html.dataset.theme, 'light');
    assert.equal(tab.Theme.GetStoredLayoutColorScheme(), 'light');
});

test('choosing the current theme again restores a cleared storage key', () => {
    const browser = createBrowser();
    const tab = browser.createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.SetLayoutColorScheme('dark');
    browser.store.clear();
    const seen = [];
    tab.Theme.OnChange((e) => seen.push(e));
    tab.Theme.SetLayoutColorScheme('dark');
    assert.equal(browser.store.get('myapp$layout-theme'), 'dark');
    assert.deepEqual(seen, []);
});

test('calling an unsubscribe twice leaves other subscriptions of the same callback', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('myapp');
    let calls = 0;
    const cb = () => { calls++; };
    const u1 = tab.Theme.OnChange(cb);
    tab.Theme.OnChange(cb);
    u1();
    u1();
    tab.Theme.SetLayoutColorScheme('dark');
    assert.equal(calls, 1);
});

test('a listener calling Initialize during the first emit does not wire twice', () => {
    const browser = createBrowser();
    const tab = browser.createTab();
    tab.Theme.OnChange(() => tab.Theme.Initialize('myapp'));
    tab.Theme.Initialize('myapp');
    assert.equal(browser.channels.get('trueshade-theme-myapp').size, 1);
    assert.equal(tab.mql.listeners.size, 1);
});

test('loading the script twice keeps the first copy', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('myapp');
    const initialize = tab.Theme.Initialize;
    tab.loadAgain();
    assert.equal(tab.Theme.Initialize, initialize);
    tab.Theme.Dispose();
    assert.equal(tab.mql.listeners.size, 0);
});

test('a non-string theme is rejected without throwing', () => {
    const tab = createBrowser().createTab();
    tab.Theme.Initialize('myapp');
    tab.Theme.SetLayoutColorScheme(Symbol('dark'));
    tab.Theme.SetLayoutColorScheme(Object.create(null));
    assert.equal(tab.errors.length, 2);
    assert.match(tab.errors[0], /Invalid theme: symbol/);
});

test('Theme.Version matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(createBrowser().createTab().Theme.Version, pkg.version);
});

test('the anti-flash snippet in the header resolves like the library', () => {
    const source = readFileSync(new URL('../Source/JS/TrueShade.js', import.meta.url), 'utf8');
    const snippet = source.match(/<script>\n([\s\S]*?)\n \*\s+<\/script>/)[1].replace(/^ \*/gm, '');
    for (const osDark of [false, true]) {
        for (const stored of [null, '', 'dark', 'light', 'system-default', 'Dark', ' dark', 'foo']) {
            const browser = createBrowser({ osDark });
            if (stored !== null) browser.store.set('myapp$layout-theme', stored);
            const dataset = {};
            const classes = new Set();
            vm.runInNewContext(snippet, {
                localStorage: { getItem: (k) => (browser.store.has(k) ? browser.store.get(k) : null) },
                matchMedia: () => ({ matches: osDark }),
                document: { documentElement: { dataset, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } },
            });
            const tab = browser.createTab();
            tab.Theme.Initialize('myapp');
            const label = `osDark=${osDark} stored=${JSON.stringify(stored)}`;
            assert.equal(dataset.theme, tab.html.dataset.theme, label);
            assert.equal(classes.has(DARK_CLASS), tab.classes.includes(DARK_CLASS), label);
        }
    }
});
