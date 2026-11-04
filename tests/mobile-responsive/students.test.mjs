import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// Uses the shared instructor fixture; no real account or backend writes.
const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173';
const webdriver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444';
let session;

async function request(path, body, method = 'POST') {
    const response = await fetch(`${webdriver}${path}`, {
        method, headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result.value;
}

before(async () => {
    const created = await request('/session', { capabilities: { alwaysMatch: {
        browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] },
    } } });
    session = created.sessionId;
    await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html` });
});
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE'); });

async function inDirectory(width, inspect, { query = '', height = 700 } = {}) {
    const value = await request(`/session/${session}/execute/async`, { args: [], script: `
        const done = arguments[arguments.length - 1];
        (async () => {
            const f = document.createElement('iframe');
            f.style.cssText = 'width:${width}px;height:${height}px;border:0;position:fixed;top:0;left:0';
            document.body.append(f);
            try {
                await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(`/instructor/students${query}`)}); });
                const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
                const ui = (${directoryUI.toString()})(f.contentWindow, wait);
                done(await (${inspect.toString()})(f.contentWindow, wait, f, ui));
            } catch (error) { done({ error: String(error) }); }
            finally { f.remove(); }
        })();` });
    assert.equal(value?.error, undefined, value?.error);
    return value;
}

// Helpers run inside each exact-width fixture, including portalled controls.
function directoryUI(w, wait) {
    const d = w.document;
    const trigger = () => d.querySelector('main button[aria-label^="Filter students"]');
    const popup = () => d.querySelector('.student-directory-filters');
    const button = (text, root = d) => [...root.querySelectorAll('button')].find(e => e.textContent.trim() === text);
    return {
        trigger, popup, button,
        async open() { trigger().click(); await wait(); return popup(); },
        async choose(label, text) {
            popup().querySelector(`[aria-label^="${label}:"]`).click(); await wait();
            [...d.querySelectorAll('[role="menuitemradio"]')].find(e => e.textContent.trim() === text).click(); await wait();
        },
        async search(value) {
            const input = d.querySelector('input[type="search"]');
            Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, value);
            input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait();
        },
        state() {
            return {
                params: Object.fromEntries(new URLSearchParams(w.location.search)),
                count: d.querySelector('[role="status"]').textContent,
                trigger: trigger().getAttribute('aria-label'),
                open: !!popup(),
            };
        },
    };
}

test('directory fits all widths with a horizontal toolbar and one filter popover', async t => {
    for (const width of [320, 390, 640, 768, 1024, 1280, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                const input = d.querySelector('input[type="search"]');
                const search = input.getBoundingClientRect();
                const filter = ui.trigger().getBoundingClientRect();
                const main = d.querySelector('main');
                const closedControls = d.querySelectorAll('[aria-label^="Rank:"]').length;
                const rows = [...d.querySelectorAll('[aria-label="Student directory"] a')];
                const name = rows[0].querySelector('.directory-name');
                const badge = rows[0].querySelector('[data-slot="grade-badge"]');
                await ui.open();
                const controls = [...ui.popup().querySelectorAll('button')].map(e => e.getBoundingClientRect());
                return {
                    fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
                    placeholder: input.placeholder,
                    searchWidth: search.width, searchHeight: search.height, filterWidth: filter.width, filterHeight: filter.height,
                    sameRow: Math.abs(search.top - filter.top) <= 1 && search.right <= filter.left,
                    padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map(p => parseFloat(w.getComputedStyle(main)[p])),
                    mainWidth: main.getBoundingClientRect().width, viewportWidth: d.documentElement.clientWidth,
                    controlSizes: controls.map(r => [r.width, r.height]), closedControls,
                    popupCount: d.querySelectorAll('.student-directory-filters').length,
                    filterLabels: [...d.querySelectorAll('[data-slot="dropdown-menu-trigger"]')].map(e => e.getAttribute('aria-label')),
                    rowHeights: rows.map(e => e.getBoundingClientRect().height),
                    metadata: rows[0].querySelectorAll('p')[1].textContent.trim(),
                    identityLayout: w.getComputedStyle(name.parentElement).display,
                    badgeBelowName: badge.getBoundingClientRect().top >= name.getBoundingClientRect().bottom,
                    count: d.querySelector('[role="status"]').textContent,
                };
            }, { query: '?dojo=Northside+Dojo' });
            assert.equal(result.fits, true, JSON.stringify(result));
            assert.equal(result.placeholder, 'Name or ID…');
            assert.equal(result.sameRow, true);
            assert.ok(result.searchWidth >= 120, JSON.stringify(result));
            const minTarget = width < 1024 ? 44 : 40;
            assert.ok(result.searchHeight >= minTarget && result.filterHeight >= minTarget && result.filterWidth >= minTarget);
            assert.ok(result.controlSizes.every(([w, h]) => w >= minTarget && h >= minTarget));
            if (width < 1024) assert.deepEqual(result.padding, [24, 24, 24, 24]);
            else {
                assert.deepEqual(result.padding, [32, 0, 32, 0]);
                assert.ok(Math.abs(result.mainWidth - Math.min(1200, result.viewportWidth * 0.92)) <= 1, JSON.stringify(result));
            }
            assert.equal(result.closedControls, 0);
            assert.equal(result.popupCount, 1);
            assert.deepEqual(result.filterLabels, ['Rank: All', 'Belt: All', 'Dojo: Northside Dojo']);
            assert.ok(result.rowHeights.every(height => height >= 44));
            assert.match(result.metadata, /^(Children's|Adults') grading$/);
            assert.equal(result.identityLayout, 'flex');
            assert.equal(result.badgeBelowName, true);
            assert.equal(result.count, '7 of 22 students');
        });
    }
});

test('directory shares student-detail page gutters, card insets and section spacing', async t => {
    for (const width of [320, 390, 768, 1024, 1280, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                const padding = e => {
                    const s = w.getComputedStyle(e);
                    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
                };
                const frame = () => {
                    const main = d.querySelector('main');
                    const r = main.getBoundingClientRect();
                    const nav = d.querySelector('nav[aria-label="Instructor navigation"]').closest('header').firstElementChild.getBoundingClientRect();
                    return { x: r.x, width: r.width, padding: padding(main), navX: nav.x, navWidth: nav.width };
                };
                const directory = frame();
                const section = d.querySelector('.student-directory-view');
                const [heading, toolbar, results] = section.children;
                const row = d.querySelector('[aria-label="Student directory"] a');
                const rowPadding = padding(row);
                const sectionGap = toolbar.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
                const resultGap = results.children[1].getBoundingClientRect().top - results.children[0].getBoundingClientRect().bottom;
                await ui.open();
                const popup = ui.popup();
                const popupPadding = padding(popup);
                const popupGap = parseFloat(w.getComputedStyle(popup).rowGap);
                const fieldGap = parseFloat(w.getComputedStyle(popup.querySelector('label').parentElement).rowGap);
                ui.button('Done', popup).click(); await wait();
                row.click(); await wait(700);
                const detail = frame();
                const detailSection = d.querySelector('.detail-section');
                const detailContent = detailSection.querySelector('[data-slot="card-content"]');
                return { directory, detail, rowPadding, sectionGap, resultGap, popupPadding, popupGap, fieldGap,
                    detailSectionGap: parseFloat(w.getComputedStyle(detailSection).gap), detailCardInset: padding(detailContent)[1] };
            });
            assert.deepEqual(result.directory, result.detail, JSON.stringify(result));
            assert.deepEqual(result.rowPadding, [12, 16, 12, 16]);
            assert.equal(result.rowPadding[1], result.detailCardInset);
            assert.equal(result.sectionGap, width < 768 ? 8 : 24);
            assert.equal(result.resultGap, result.detailSectionGap);
            assert.equal(result.resultGap, 16);
            assert.deepEqual(result.popupPadding, [16, 16, 16, 16]);
            assert.equal(result.popupGap, 12);
            assert.equal(result.fieldGap, 6);
        });
    }
});

test('mobile typography is exact and desktop keeps its existing scale', async t => {
    for (const width of [320, 390, 768, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                const style = e => {
                    const s = w.getComputedStyle(e);
                    return [parseFloat(s.fontSize), parseFloat(s.lineHeight)];
                };
                const row = d.querySelector('[aria-label="Student directory"] a');
                const firstTop = row.getBoundingClientRect().top;
                const styles = {
                    heading: style(d.querySelector('h1')),
                    input: style(d.querySelector('input[type="search"]')),
                    button: style(ui.trigger()),
                    name: style(row.querySelector('.directory-name')),
                    metadata: style(row.querySelector('.directory-meta')),
                    badge: style(row.querySelector('[data-slot="grade-badge"]')),
                };
                const metadata = row.querySelectorAll('p')[1].textContent.trim();
                const dojo = [...row.querySelectorAll('.directory-meta')].filter(e => e.getClientRects().length).at(-1).textContent.trim();
                await ui.open();
                styles.filter = style(ui.popup().querySelector('[aria-label^="Rank:"]'));
                styles.label = style(ui.popup().querySelector('label'));
                styles.done = style(ui.button('Done', ui.popup()));
                ui.popup().querySelector('[aria-label^="Rank:"]').click(); await wait();
                styles.option = style(d.querySelector('[role="menuitemradio"]'));
                return { styles, firstTop, metadata, dojo };
            });
            assert.equal(result.metadata, 'STU-0001 · Children');
            assert.equal(result.dojo, 'Central Dojo');
            if (width < 768) {
                assert.deepEqual(result.styles, {
                    heading: [24, 32], input: [16, 24], button: [16, 24], name: [16, 24],
                    metadata: [14, 20], badge: [12, 16], filter: [16, 24], label: [12, 16], done: [16, 24], option: [16, 24],
                });
                assert.ok(result.firstTop < 300, JSON.stringify(result));
            } else {
                // Desktop Tailwind tokens use the project's existing 1.25x scale.
                const sizes = Object.fromEntries(Object.entries(result.styles).map(([role, [size]]) => [role, size]));
                assert.deepEqual(sizes, {
                    heading: 37.5, input: 17.5, button: 17.5, name: 17.5, metadata: 15,
                    badge: 13.75, filter: 17.5, label: 17.5, done: 17.5, option: 17.5,
                });
            }
        });
    }
});

test('long student identity and dojo text wrap without clipping at 200% root text', async t => {
    for (const width of [320, 390, 640, 1024, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait) => {
                const d = w.document;
                const row = d.querySelector('[aria-label="Student directory"] a');
                const name = row.querySelector('.directory-name');
                const metadata = row.querySelectorAll('p')[1];
                name.textContent = 'Alexandria-CatherineVanDerWesthuizen'.repeat(3);
                metadata.textContent = 'STUDENT-'.repeat(12) + ' · Extended children’s grading programme';
                const dojos = [row.querySelectorAll('p')[2], row.querySelector('span.directory-meta')];
                dojos.forEach(e => { e.textContent = 'InternationalDojoTrainingCentre'.repeat(3); });
                const check = () => {
                    const bounds = row.getBoundingClientRect();
                    const elements = [name, metadata, ...dojos, row.querySelector('[data-slot="grade-badge"] > span')].filter(e => e.getClientRects().length).map(e => {
                        const range = d.createRange(); range.selectNodeContents(e);
                        const rects = [...range.getClientRects()];
                        return { role: e === name ? 'name' : e === metadata ? 'metadata' : dojos.includes(e) ? 'dojo' : 'badge',
                            fits: e.scrollWidth <= e.clientWidth + 1 && rects.every(r => r.left >= bounds.left - 1 && r.right <= bounds.right + 1 && r.top >= bounds.top - 1 && r.bottom <= bounds.bottom + 1),
                            clientWidth: e.clientWidth, scrollWidth: e.scrollWidth,
                            textLeft: Math.min(...rects.map(r => r.left)), textRight: Math.max(...rects.map(r => r.right)) };
                    });
                    return { elements, pageFits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
                        separated: (() => {
                            const n = name.getBoundingClientRect();
                            const b = row.querySelector('[data-slot="grade-badge"]').getBoundingClientRect();
                            return n.right <= b.left + 1 || n.bottom <= b.top + 1;
                        })(),
                        rowLeft: bounds.left, rowRight: bounds.right };
                };
                const normal = check();
                // Text enlargement, not a claim of native browser/pinch zoom testing.
                d.documentElement.style.fontSize = '200%'; await wait();
                return { normal, enlarged: check(), wraps: w.getComputedStyle(name).whiteSpace !== 'nowrap' };
            });
            for (const size of ['normal', 'enlarged']) {
                assert.equal(result[size].pageFits, true, `${width} ${size}: ${JSON.stringify(result[size])}`);
                assert.equal(result[size].separated, true, `${width} ${size}: ${JSON.stringify(result[size])}`);
                assert.ok(result[size].elements.every(e => e.fits), `${width} ${size}: ${JSON.stringify(result[size])}`);
            }
            assert.equal(result.wraps, true);
        });
    }
});

test('filters apply live; reset retains search, unrelated URL parameters and the open popover', async t => {
    for (const width of [320, 768, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                await ui.search('STU-0002');
                const searchOnly = ui.state();
                await ui.open();
                const resetInitiallyDisabled = ui.button('Reset filters', ui.popup()).disabled;
                const changes = [];
                for (const [label, value] of [['Rank', '8th Kyu'], ['Belt', 'Green belt'], ['Dojo', 'Northside Dojo']]) {
                    await ui.choose(label, value);
                    changes.push({ ...ui.state(), innerClosed: !d.querySelector('[role="menu"]') });
                }
                const name = d.querySelector('[aria-label="Student directory"] a').textContent;
                await ui.choose('Belt', 'Yellow belt');
                const incompatible = { ...ui.state(), rows: d.querySelectorAll('[aria-label="Student directory"] a').length };
                await ui.choose('Belt', 'Green belt');
                const restored = ui.state();
                const resetEnabled = !ui.button('Reset filters', ui.popup()).disabled;
                ui.button('Reset filters', ui.popup()).click(); await wait();
                const reset = { ...ui.state(), disabled: ui.button('Reset filters', ui.popup()).disabled, search: d.querySelector('input[type="search"]').value };
                ui.button('Done', ui.popup()).click(); await wait();
                return { searchOnly, resetInitiallyDisabled, changes, name, incompatible, restored, resetEnabled, reset, done: { open: !!ui.popup(), focused: d.activeElement === ui.trigger() } };
            }, { query: '?context=keep&sort=name' });
            const unrelated = { context: 'keep', sort: 'name' };
            assert.deepEqual(result.searchOnly, { params: { ...unrelated, q: 'STU-0002' }, count: '1 of 22 students', trigger: 'Filter students', open: false });
            assert.equal(result.resetInitiallyDisabled, true);
            const filters = {};
            for (const [index, [key, value]] of [['rank', '8-kyu'], ['belt', 'Green belt'], ['dojo', 'Northside Dojo']].entries()) {
                filters[key] = value;
                assert.deepEqual(result.changes[index], {
                    params: { ...unrelated, q: 'STU-0002', ...filters }, count: '1 of 22 students',
                    trigger: `Filter students, ${index + 1} active filters`, open: true, innerClosed: true,
                });
            }
            assert.match(result.name, /Noah Patel/);
            assert.deepEqual(result.incompatible, {
                params: { ...unrelated, q: 'STU-0002', ...filters, belt: 'Yellow belt' }, count: '0 of 22 students',
                trigger: 'Filter students, 3 active filters', open: true, rows: 0,
            });
            assert.deepEqual(result.restored, {
                params: { ...unrelated, q: 'STU-0002', ...filters }, count: '1 of 22 students', trigger: 'Filter students, 3 active filters', open: true,
            });
            assert.equal(result.resetEnabled, true);
            assert.deepEqual(result.reset, { params: { ...unrelated, q: 'STU-0002' }, count: '1 of 22 students', trigger: 'Filter students', open: true, disabled: true, search: 'STU-0002' });
            assert.deepEqual(result.done, { open: false, focused: true });
        });
    }
});

test('Clear all and the empty-state action clear search and filters and focus search', async t => {
    for (const width of [320, 768, 1440]) {
        await t.test(`${width}px`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                const input = d.querySelector('input[type="search"]');
                const clearState = () => ({ ...ui.state(), focused: d.activeElement === input, search: input.value, clearCount: d.querySelectorAll('[aria-label="Clear all search and filters"]').length });
                const clear = d.querySelector('[aria-label="Clear all search and filters"]');
                const besideCount = clear.parentElement.contains(d.querySelector('[role="status"]'));
                const clearHeight = clear.getBoundingClientRect().height;
                clear.click(); await wait();
                const all = clearState();
                await ui.search('No matching student');
                await ui.open();
                await ui.choose('Rank', '10th Kyu');
                await ui.choose('Belt', 'Yellow belt');
                await ui.choose('Dojo', 'Central Dojo');
                ui.button('Done', ui.popup()).click(); await wait();
                const empty = { ...ui.state(), heading: d.querySelector('h2').textContent, rows: d.querySelectorAll('[aria-label="Student directory"] a').length };
                const emptyAction = ui.button('Clear search and filters', d.querySelector('main'));
                const emptyHeight = emptyAction.getBoundingClientRect().height;
                emptyAction.click(); await wait();
                return { besideCount, clearHeight, all, empty, emptyHeight, clearedEmpty: clearState() };
            }, { query: '?context=keep&q=emma&rank=10-kyu&belt=Yellow+belt&dojo=Central+Dojo' });
            const cleared = { params: { context: 'keep' }, count: '22 students', trigger: 'Filter students', open: false, focused: true, search: '', clearCount: 0 };
            assert.equal(result.besideCount, true);
            assert.ok(result.clearHeight >= (width < 1024 ? 44 : 40));
            assert.ok(result.emptyHeight >= (width < 1024 ? 44 : 40));
            assert.deepEqual(result.all, cleared);
            assert.deepEqual(result.empty, {
                params: { context: 'keep', q: 'No matching student', rank: '10-kyu', belt: 'Yellow belt', dojo: 'Central Dojo' },
                count: '0 of 22 students', trigger: 'Filter students, 3 active filters', open: false, heading: 'No students found', rows: 0,
            });
            assert.deepEqual(result.clearedEmpty, cleared);
        });
    }
});

test('deep-linked filters survive resizing and opening a student then browser Back', async () => {
    const result = await inDirectory(320, async (w, wait, f, ui) => {
        const d = w.document;
        const before = w.location.search;
        const initial = d.querySelector('[role="status"]').textContent;
        await ui.open();
        const popup = ui.popup();
        const resized = [];
        for (const width of [1440, 768, 390, 320]) {
            f.style.width = width + 'px'; await wait();
            resized.push({ ...ui.state(), samePopup: ui.popup() === popup, popupCount: d.querySelectorAll('.student-directory-filters').length,
                controls: d.querySelectorAll('[data-slot="dropdown-menu-trigger"]').length, forms: d.querySelectorAll('main form, .student-directory-filters form').length,
                searches: d.querySelectorAll('main input[type="search"]').length, triggers: d.querySelectorAll('main [aria-label^="Filter students"]').length });
        }
        ui.button('Done', ui.popup()).click(); await wait();
        d.querySelector('[aria-label="Student directory"] a').click(); await wait(700);
        const detail = { path: w.location.pathname, title: d.querySelector('h1').textContent };
        w.history.back(); await wait(700);
        return { before, initial, resized, detail, after: w.location.search, count: d.querySelector('[role="status"]').textContent, trigger: ui.trigger().getAttribute('aria-label'), closed: !ui.popup() };
    }, { query: '?q=emma&rank=10-kyu&belt=Yellow+belt&dojo=Central+Dojo' });
    assert.equal(result.initial, '1 of 22 students');
    for (const resized of result.resized) assert.deepEqual(resized, {
        params: Object.fromEntries(new URLSearchParams(result.before)), count: result.initial,
        trigger: 'Filter students, 3 active filters', open: true, samePopup: true, popupCount: 1, controls: 3, forms: 0, searches: 1, triggers: 1,
    });
    assert.equal(result.detail.path, '/instructor/students/student-1');
    assert.match(result.detail.title, /Emma Wilson/);
    assert.equal(result.after, result.before);
    assert.equal(result.count, result.initial);
    assert.equal(result.trigger, 'Filter students, 3 active filters');
    assert.equal(result.closed, true);
});

test('enlarged mobile text keeps empty-state and popover actions contained and reachable', async () => {
    const result = await inDirectory(320, async (w, wait, f, ui) => {
        const d = w.document;
        d.documentElement.style.fontSize = '200%'; await wait();
        const emptyButton = ui.button('Clear search and filters', d.querySelector('main'));
        const fits = e => e.scrollWidth <= e.clientWidth + 1;
        const emptyFits = fits(emptyButton) && d.documentElement.scrollWidth <= d.documentElement.clientWidth;
        ui.trigger().scrollIntoView({ block: 'start' });
        await ui.open();
        const popup = ui.popup();
        const popupFits = fits(popup);
        popup.scrollTop = popup.scrollHeight; await wait();
        const bounds = popup.getBoundingClientRect();
        const actionsFit = ['Reset filters', 'Done'].every(text => {
            const button = ui.button(text, popup);
            const r = button.getBoundingClientRect();
            return fits(button) && r.left >= bounds.left && r.right <= bounds.right;
        });
        const done = ui.button('Done', popup);
        done.scrollIntoView({ block: 'nearest' }); await wait();
        const action = done.getBoundingClientRect();
        const doneReachable = action.top >= 0 && action.bottom <= w.innerHeight;
        done.click(); await wait();
        return { emptyFits, popupFits, actionsFit, doneReachable, closed: !ui.popup(), focused: d.activeElement === ui.trigger() };
    }, { query: '?q=no-matching-student&rank=10-kyu' });
    assert.deepEqual(result, { emptyFits: true, popupFits: true, actionsFit: true, doneReachable: true, closed: true, focused: true });
});

test('short-screen popover and nested menus stay bounded with scroll-reachable footer and options', async t => {
    for (const [width, height] of [[320, 568], [568, 320], [844, 390]]) {
        await t.test(`${width}×${height}`, async () => {
            const result = await inDirectory(width, async (w, wait, f, ui) => {
                const d = w.document;
                ui.trigger().scrollIntoView({ block: 'center' });
                await ui.open();
                const popup = ui.popup();
                const bounded = e => {
                    const r = e.getBoundingClientRect();
                    return r.left >= -1 && r.right <= w.innerWidth + 1 && r.top >= -1 && r.bottom <= w.innerHeight + 1;
                };
                const popupBounded = bounded(popup);
                const scrollable = ['auto', 'scroll'].includes(w.getComputedStyle(popup).overflowY);
                const needsScroll = popup.scrollHeight > popup.clientHeight;
                popup.scrollTop = popup.scrollHeight; await wait();
                const rect = popup.getBoundingClientRect();
                const footerReachable = ['Reset filters', 'Done'].every(text => {
                    const r = ui.button(text, popup).getBoundingClientRect();
                    return r.top >= rect.top && r.bottom <= rect.bottom + 1 && bounded(ui.button(text, popup));
                });
                const scrollTop = popup.scrollTop;
                const menus = [];
                for (const label of ['Rank', 'Belt', 'Dojo']) {
                    const trigger = popup.querySelector(`[aria-label^="${label}:"]`);
                    trigger.scrollIntoView({ block: 'nearest' }); trigger.click(); await wait();
                    const menu = d.querySelector('.student-directory-filter-menu');
                    const item = menu.querySelector('[role="menuitemradio"]');
                    item.lastElementChild.textContent = 'LongUnbrokenFilterLabel'.repeat(8);
                    await wait();
                    const bounds = menu.getBoundingClientRect();
                    menu.scrollTop = menu.scrollHeight; await wait();
                    const last = [...menu.querySelectorAll('[role="menuitemradio"]')].at(-1).getBoundingClientRect();
                    menus.push({ bounded: bounded(menu), lastReachable: last.bottom <= bounds.bottom + 1 && last.top >= bounds.top,
                        labelFits: item.scrollWidth <= item.clientWidth + 1,
                        targetHeights: [...menu.querySelectorAll('[role="menuitemradio"]')].every(e => e.getBoundingClientRect().height >= 44) });
                    // Geometry checks use DOM activation; native dismissal is checked below.
                    [...menu.querySelectorAll('[role="menuitemradio"]')].at(-1).click(); await wait();
                }
                popup.scrollTop = popup.scrollHeight;
                ui.button('Done', popup).click();
                await wait();
                return { popupBounded, scrollable, needsScroll, scrollTop, footerReachable, menus, closed: !ui.popup(), focused: d.activeElement === ui.trigger() };
            }, { height });
            assert.equal(result.popupBounded, true, JSON.stringify(result));
            assert.equal(result.scrollable, true);
            assert.equal(result.footerReachable, true, JSON.stringify(result));
            if (height <= 390) {
                assert.equal(result.needsScroll, true);
                assert.ok(result.scrollTop > 0);
            }
            assert.deepEqual(result.menus, Array.from({ length: 3 }, () => ({ bounded: true, lastReachable: true, labelFits: true, targetHeights: true })));
            assert.equal(result.closed, true);
            assert.equal(result.focused, true);
        });
    }
});

test('native keyboard events select filters, dismiss menus and open student links', async () => {
    await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html?route=/instructor/students` });
    const inspect = script => request(`/session/${session}/execute/sync`, { args: [], script });
    const key = async value => {
        await request(`/session/${session}/actions`, { actions: [{ type: 'key', id: 'keyboard', actions: [
            { type: 'keyDown', value }, { type: 'keyUp', value },
        ] }] });
        await new Promise(resolve => setTimeout(resolve, 300));
    };
    // Start at search, then use native Tab/Enter rather than synthetic DOM events.
    await new Promise(resolve => setTimeout(resolve, 700));
    await inspect(`document.querySelector('input[type="search"]').focus()`);
    await key('\uE004'); // Tab
    assert.equal(await inspect(`return document.activeElement.getAttribute('aria-label')`), 'Filter students');
    await key('\uE007'); // Enter
    assert.equal(await inspect(`return document.querySelectorAll('.student-directory-filters').length`), 1);
    assert.equal(await inspect(`return document.activeElement.getAttribute('aria-label')`), 'Rank: All');
    await key('\uE007');
    assert.equal(await inspect(`return !!document.querySelector('[role="menu"]')`), true);
    await key('\uE015'); // ArrowDown: All ranks -> first rank
    await key('\uE007');
    assert.equal(await inspect(`return new URLSearchParams(location.search).get('rank')`), '10-kyu');
    assert.equal(await inspect(`return document.querySelector('[role="status"]').textContent`), '5 of 22 students');
    assert.equal(await inspect(`return [...document.querySelectorAll('[aria-label="Student directory"] [data-slot="grade-badge"]')].every(e => e.dataset.rank === '10-kyu')`), true);
    assert.equal(await inspect(`return document.activeElement.getAttribute('aria-label')`), 'Rank: 10th Kyu');
    await key('\uE007');
    await key('\uE00C'); // Escape
    assert.equal(await inspect(`return !document.querySelector('[role="menu"]') && !!document.querySelector('.student-directory-filters') && document.activeElement.getAttribute('aria-label') === 'Rank: 10th Kyu'`), true);
    await key('\uE00C'); // A second Escape dismisses only the parent.
    assert.equal(await inspect(`return !document.querySelector('.student-directory-filters') && document.activeElement.getAttribute('aria-label') === 'Filter students, 1 active filters'`), true);
    await key('\uE007');
    assert.equal(await inspect(`return document.activeElement.getAttribute('aria-label')`), 'Rank: 10th Kyu');
    for (const expected of ['Belt: All', 'Dojo: All']) {
        await key('\uE004');
        assert.equal(await inspect(`return document.activeElement.getAttribute('aria-label')`), expected);
    }
    await key('\uE004');
    assert.equal(await inspect(`return document.activeElement.textContent.trim()`), 'Reset filters');
    await key('\uE004');
    assert.equal(await inspect(`return document.activeElement.textContent.trim()`), 'Done');
    await key('\uE007');
    assert.equal(await inspect(`return !document.querySelector('.student-directory-filters') && document.activeElement.getAttribute('aria-label') === 'Filter students, 1 active filters'`), true);
    await key('\uE007');
    // A real pointer click outside the popover exercises pointerdown dismissal.
    const heading = await request(`/session/${session}/element`, { using: 'css selector', value: 'main h1' });
    await request(`/session/${session}/element/${heading['element-6066-11e4-a52e-4f735466cecf']}/click`, {});
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(await inspect(`return !document.querySelector('.student-directory-filters') && document.activeElement.getAttribute('aria-label') === 'Filter students, 1 active filters'`), true);
    assert.equal(await inspect(`return new URLSearchParams(location.search).get('rank')`), '10-kyu');
    await inspect(`document.querySelector('[aria-label="Student directory"] a').focus()`);
    await key('\uE007');
    assert.equal(await inspect(`return location.pathname`), '/instructor/students/student-1');
});
