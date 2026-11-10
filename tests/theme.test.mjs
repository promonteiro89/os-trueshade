import { test } from 'node:test';
import assert from 'node:assert/strict';
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

    a.Theme.SetLayoutColorScheme('dark');
    assert.equal(b.html.dataset.theme, 'dark');
    assert.ok(b.classes.includes(DARK_CLASS));
    assert.equal(b.Theme.GetStoredLayoutColorScheme(), 'dark');
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
