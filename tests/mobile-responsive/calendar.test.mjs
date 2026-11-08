import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// Run Vite and geckodriver --port 4444 first. No real account or backend is used.
const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173';
const webdriver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444';
let session;
async function request(path, body, method = 'POST') {
    const response = await fetch(`${webdriver}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result.value;
}
before(async () => {
    const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } });
    session = created.sessionId;
    await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html` });
});
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE'); });

test('date-only gradings use existing list/month cards and drawers without an invented timestamp or timeline block', async () => {
    for (const width of [390, 1280]) for (const mode of ['date-only-grading', 'date-only-released']) {
        const result = await inCalendar(width, `/instructor/calendar?view=month&date=2026-11-3&fixtureData=${mode}&session=00000000-0000-4000-8000-000000008800`, async (w, wait) => {
            const d = w.document;
            await wait();
            const text = d.body.textContent;
            const roster = d.querySelector('[aria-label="Student roster"]');
            const before = { text, roster: !!roster, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth };
            const close = d.querySelector('[aria-label="Close drawer"]');
            if (close) { close.click(); await wait(); }
            if (d.querySelector('[aria-label="Change calendar view"]')) {
                d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
                d.querySelector('[data-calendar-view="day"]').click(); await wait();
            }
            return { ...before, noInvalidGeometry: ![...d.querySelectorAll('[data-mobile-event]')].some(e => /NaN/.test(e.getAttribute('style'))) };
        });
        assert.match(result.text, /Official date-only grading/);
        assert.match(result.text, mode === 'date-only-released' ? /Report at 10:30 AM/ : /Time not published/);
        if (mode === 'date-only-grading') assert.doesNotMatch(result.text, /10:30 AM|12:00 AM/);
        assert.doesNotMatch(result.text, /NaN|Invalid Date/);
        assert.equal(result.roster, true);
        assert.equal(result.fits, true);
        assert.equal(result.noInvalidGeometry, true);
    }
});

async function inCalendar(width, route, inspect, height = 700) {
    const value = await request(`/session/${session}/execute/async`, { args: [], script: `
        const done = arguments[arguments.length - 1];
        (async () => {
            const f = document.createElement('iframe');
            f.style.cssText = 'width:${width}px;height:${height}px;border:0;position:fixed;top:0;left:0';
            document.body.append(f);
            try {
                await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(route)}); });
                const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
                const result = await (${inspect.toString()})(f.contentWindow, wait, f);
                done(result);
            } catch (error) { done({ error: String(error) }); }
            finally { f.remove(); }
        })();` });
    assert.equal(value?.error, undefined, value?.error);
    return value;
}

test('all mobile views fit 320–430px, with one document scroller and accurately positioned timeline events', async () => {
    for (const width of [320, 360, 390, 430]) {
        const result = await inCalendar(width, '/instructor/calendar?view=week&date=2026-11-4', async (w, wait) => {
            const d = w.document;
            const output = [];
            for (const mode of ['day', 'multi-day', 'month', 'list']) {
                d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
                d.querySelector(`[data-calendar-view="${mode}"]`).click();
                await wait();
                output.push({ mode, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth, month: d.querySelectorAll('[aria-label="Month dates"] button').length, agenda: !!d.querySelector('[aria-label="Chronological agenda"]'),
                    timelineDays: [...d.querySelectorAll('[data-mobile-timeline-day]')].map(e => e.getAttribute('data-mobile-timeline-day')),
                    dateHeading: !!d.querySelector('[data-mobile-calendar] h2'), weekStrip: !!d.querySelector('[aria-label="Swipe to change week"]'),
                    pickerDescription: d.querySelector('[aria-label="Change calendar view"]').getAttribute('aria-description')?.toLowerCase(),
                    iconOnly: d.querySelector('[aria-label="Change calendar view"]').textContent === '' && !!d.querySelector('[aria-label="Change calendar view"] svg'),
                    pickerClosed: d.querySelector('[aria-label="Change calendar view"]').getAttribute('aria-expanded') === 'false' });
            }
            d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
            d.querySelector('[data-calendar-view="day"]').click();
            await wait();
            const timeline = d.querySelector('[aria-label="Selected day hourly timeline"]');
            const event = timeline.querySelector('[data-mobile-event]');
            const style = w.getComputedStyle(event);
            return { output, top: Number.parseFloat(style.top), height: Number.parseFloat(style.height),
                scrollers: [...d.querySelector('[data-mobile-calendar]').querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(w.getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight).length };
        });
        assert.ok(result.output.every(view => view.fits), JSON.stringify(result));
        assert.ok(result.output.every(view => view.pickerClosed && view.iconOnly && view.pickerDescription === `current view: ${view.mode === 'multi-day' ? 'multi day' : view.mode}`), JSON.stringify(result));
        assert.equal(result.output.find(view => view.mode === 'month').month, 42);
        assert.equal(result.output.find(view => view.mode === 'list').agenda, true);
        assert.equal(result.output.find(view => view.mode === 'list').dateHeading, false);
        assert.equal(result.output.find(view => view.mode === 'list').weekStrip, false);
        assert.equal(result.output.find(view => view.mode === 'day').dateHeading, false);
        assert.equal(result.output.find(view => view.mode === 'multi-day').dateHeading, false);
        assert.deepEqual(result.output.find(view => view.mode === 'multi-day').timelineDays, ['2026-11-4', '2026-11-5']);
        assert.deepEqual(result.output.find(view => view.mode === 'day').timelineDays, ['2026-11-4']);
        // First entry is the existing 09:00–11:00 availability; 08:00 origin,
        // 1.6px/minute, with a one-pixel inset at each end.
        assert.equal(result.top, 97);
        assert.equal(result.height, 190);
        assert.equal(result.scrollers, 0);
    }
});

test('calendar controls are distinct from site navigation and information stays beside availability', async () => {
    for (const width of [320, 390, 430]) {
        const result = await inCalendar(width, '/instructor/calendar?view=week&date=2026-11-4', async (w, wait) => {
            const d = w.document;
            const header = d.querySelector('[data-mobile-calendar] header');
            const today = [...header.querySelectorAll('button')].find(e => e.textContent === 'Today');
            const add = [...header.querySelectorAll('button')].find(e => e.textContent.includes('Add Availability'));
            const info = header.querySelector('[aria-label="Calendar colours"]');
            const title = header.querySelector('h1');
            const picker = header.querySelector('[aria-label="Change calendar view"]');
            picker.click(); await wait();
            const style = element => { const s = w.getComputedStyle(element); return [s.backgroundColor, s.borderRadius, s.height, s.fontSize]; };
            return {
                separateNavigation: !header.contains(d.querySelector('[data-mobile-site-nav]')),
                views: [...d.querySelectorAll('[data-calendar-view]')].map(option => option.textContent.toLowerCase()),
                besideTitle: picker.parentElement === title.parentElement && picker.getBoundingClientRect().left >= title.getBoundingClientRect().right,
                title: title.textContent,
                todayAndArrows: !!today.parentElement.querySelector('[aria-label="Previous day"]') && !!today.parentElement.querySelector('[aria-label="Next day"]'),
                infoAfterAdd: info.parentElement === add.parentElement && info.getBoundingClientRect().left >= add.getBoundingClientRect().right,
                todayStyle: style(today), addStyle: style(add),
            };
        });
        assert.equal(result.separateNavigation, true);
        assert.deepEqual(result.views, ['day', 'multi day', 'month', 'list']);
        assert.equal(result.besideTitle, true);
        assert.match(result.title, /2026/);
        assert.equal(result.todayAndArrows, true);
        assert.equal(result.infoAfterAdd, true);
        assert.deepEqual(result.todayStyle, result.addStyle);
    }
});

test('desktop class details preserve Timeline in day/week views and after remounting the selected class route', async () => {
    for (const view of ['day', 'week']) {
        const result = await inCalendar(1280, `/instructor/calendar?view=${view}&date=2026-11-4`, async (w, wait, frame) => {
            let d = w.document;
            const timelineSelector = '[aria-label="Daily hourly timeline"], [aria-label="Weekly hourly timeline"]';
            d.querySelector('[aria-label^="Calendar display mode:"]').click(); await wait();
            [...d.querySelectorAll('[role="menuitemradio"]')].find(item => item.textContent.trim().startsWith('Timeline')).click(); await wait();
            const timeline = d.querySelector(timelineSelector);
            const event = timeline.querySelector('button[data-prefetch-class]');
            const selectedId = event.getAttribute('data-prefetch-class');
            event.click(); await wait(500);
            const afterSelect = Boolean(d.querySelector(timelineSelector)) && Boolean(d.querySelector('[aria-label="Student roster"]'))
                && d.querySelector('[aria-label="Calendar display mode: timeline"]') !== null;
            const selectionRetained = new URLSearchParams(w.location.search).get('session') === selectedId;
            const beforeReload = w.location.pathname + w.location.search;
            await new Promise(resolve => {
                frame.onload = () => { frame.onload = null; setTimeout(resolve, 800); };
                frame.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(beforeReload);
            });
            d = w.document;
            const afterReload = Boolean(d.querySelector(timelineSelector)) && Boolean(d.querySelector('[aria-label="Student roster"]'))
                && d.querySelector('[aria-label="Calendar display mode: timeline"]') !== null;
            const retainedId = new URLSearchParams(w.location.search).get('session');
            d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait();
            const afterClose = Boolean(d.querySelector(timelineSelector)) && !new URLSearchParams(w.location.search).has('session');
            return { afterSelect, selectionRetained, afterReload, afterClose, retainedId, selectedId };
        });
        for (const key of ['afterSelect', 'selectionRetained', 'afterReload', 'afterClose']) assert.equal(result[key], true, `${view}: ${key}`);
        assert.equal(result.retainedId, result.selectedId);
    }
});

test('site navbar sticks to the viewport and view-picker options retain distinct icons', async () => {
    for (const width of [320, 390, 430]) {
        const result = await inCalendar(width, '/instructor/calendar?view=week&date=2026-11-4', async (w, wait) => {
            const d = w.document;
            const header = d.querySelector('[data-mobile-site-nav]');
            w.scrollTo(0, 500); await wait();
            const bounds = header.getBoundingClientRect();
            const scrollY = w.scrollY;
            w.scrollTo(0, 0); await wait();
            d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
            const options = [...d.querySelectorAll('[data-calendar-view]')];
            return {
                scrollY, top: bounds.top, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
                icons: options.map(option => option.querySelector('svg')?.getAttribute('class')),
                labelled: options.every(option => option.textContent.trim().length > 0),
            };
        });
        assert.ok(result.scrollY >= 500);
        assert.ok(Math.abs(result.top) <= 1);
        assert.equal(result.fits, true);
        assert.equal(result.icons.length, 4);
        assert.ok(result.icons.every(Boolean));
        assert.equal(new Set(result.icons).size, 4);
        assert.equal(result.labelled, true);
    }
});

test('left navigation Sheet shows role links, account details, active state and returns focus', async () => {
    const cases = [
        ['/instructor/calendar?date=2026-11-4', 'Instructor', ['Calendar', 'Students', 'Check-in', 'Profile']],
        ['/dashboard?fixtureRole=student', 'Student', ['Dashboard', 'Timetable', 'Attendance', 'Classes', 'Grading', 'Profile']],
        ['/login?fixtureRole=guest', 'Guest', ['Sign in', 'Sign up']],
    ];
    for (const [route, role, labels] of cases) {
        const result = await inCalendar(320, route, async (w, wait, f) => {
            const d = w.document;
            const trigger = d.querySelector('[data-mobile-site-nav] [aria-label="Open navigation menu"]');
            trigger.focus(); trigger.click(); await wait();
            const sheet = d.querySelector('[data-slot="sheet-content"]');
            const rect = sheet.getBoundingClientRect();
            const links = [...sheet.querySelectorAll('nav a')];
            const output = { left: rect.left, right: rect.right, width: w.innerWidth,
                labels: links.map(link => link.textContent.trim()), active: links.filter(link => link.getAttribute('aria-current') === 'page').length,
                description: sheet.querySelector('nav').getAttribute('aria-label'),
                account: sheet.textContent.includes('test@example.com'),
                padding: w.getComputedStyle(sheet).padding,
            };
            [...sheet.querySelectorAll('button')].find(button => button.textContent.includes('Close')).click(); await wait(400);
            output.closed = !d.querySelector('[data-slot="sheet-content"]');
            output.focused = d.activeElement === trigger;
            trigger.click(); await wait();
            d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(400);
            output.escapeCloses = !d.querySelector('[data-slot="sheet-content"]');
            trigger.click(); await wait();
            d.querySelector('[data-slot="sheet-content"] nav a[aria-current="page"]').click(); await wait(400);
            output.linkCloses = !d.querySelector('[data-slot="sheet-content"]');
            trigger.click(); await wait();
            f.style.width = '1280px'; await wait(400);
            output.closedOnDesktop = !d.querySelector('[data-slot="sheet-content"]');
            output.desktopNavigationVisible = !d.querySelector('[data-mobile-site-nav]').getClientRects().length && [...d.querySelectorAll('header nav a')].some(link => link.getClientRects().length > 0);
            return output;
        });
        assert.ok(Math.abs(result.left) <= 1 && result.right <= result.width);
        assert.deepEqual(result.labels, labels);
        assert.equal(result.active, 1);
        assert.equal(result.description, `${role} navigation`);
        assert.equal(result.account, role !== 'Guest');
        assert.equal(result.padding, '16px');
        assert.equal(result.closed, true);
        assert.equal(result.focused, true);
        assert.equal(result.escapeCloses, true);
        assert.equal(result.linkCloses, true);
        assert.equal(result.closedOnDesktop, true);
        assert.equal(result.desktopNavigationVisible, true);
    }
    // AdminLayout owns its separate navbar; RootLayout intentionally does not
    // mount the public/instructor navigation for this fixture's /admin route.
    const admin = await inCalendar(320, '/admin?fixtureRole=administrator', async w => ({
        sharedNavigation: !!w.document.querySelector('[data-mobile-site-nav]'),
    }));
    assert.equal(admin.sharedNavigation, false);
});

test('mobile instructor main uses 24px padding, overlays use 16px insets, and roster identity, grade and actions share one line', async () => {
    for (const width of [320, 390, 430]) {
        const result = await inCalendar(width, '/instructor/calendar?view=day&date=2026-11-27', async (w, wait) => {
            const d = w.document;
            const inset = element => { const s = w.getComputedStyle(element); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft]; };
            const main = inset(d.querySelector('main'));
            d.querySelector('[aria-label="Calendar colours"]').click(); await wait();
            const legend = inset(d.querySelector('[data-slot="popover-content"]'));
            d.querySelector('[aria-label="Calendar colours"]').click(); await wait();
            d.querySelector('[data-mobile-event]').click(); await wait();
            const drawer = d.querySelector('[data-slot="drawer-content"]');
            const body = drawer.querySelector('[data-slot="drawer-body"]');
            const row = body.querySelector('[aria-label="Student roster"] li');
            const name = row.querySelector('[aria-label^="Student details:"]');
            const grade = row.querySelector('[data-slot="grade-badge"]');
            const action = row.querySelector('button[aria-label^="Mark "]');
            const report = row.querySelector('a');
            const center = element => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; };
            const aligned = [grade, action, report].every(element => Math.abs(center(name) - center(element)) < 1);
            const actions = [...row.querySelectorAll('[role="group"] button'), report].map(element => { const r = element.getBoundingClientRect(); return [r.width, r.height]; });
            name.click(); await wait();
            const identity = d.querySelector('[data-slot="popover-content"]');
            const fullName = identity.textContent.includes(name.getAttribute('aria-label').replace('Student details: ', ''));
            const identityPadding = inset(identity);
            name.click(); await wait();
            const output = { main, legend, drawerBody: inset(body), aligned, actions, fullName, identityPadding, overflow: d.documentElement.scrollWidth > d.documentElement.clientWidth };
            drawer.querySelector('[data-slot="drawer-header"] button').click(); await wait(400);
            output.addDisabled = [...d.querySelectorAll('button')].find(button => button.textContent.includes('Add Availability')).disabled;
            return output;
        });
        assert.deepEqual(result.main, ['24px', '24px', '24px', '24px']);
        for (const padding of [result.legend, result.drawerBody, result.identityPadding]) assert.deepEqual(padding, ['16px', '16px', '16px', '16px']);
        assert.equal(result.addDisabled, false);
        assert.equal(result.aligned, true);
        assert.equal(result.fullName, true);
        assert.equal(result.overflow, false);
        assert.ok(result.actions.every(([width, height]) => width >= 44 && height >= 44));
    }
});

test('mobile spacing keeps generous targets, separates controls and gives agenda rows breathing room', async () => {
    for (const width of [320, 390, 430]) {
        const result = await inCalendar(width, '/instructor/calendar?view=week&date=2026-11-4', async (w, wait) => {
            const d = w.document;
            const header = d.querySelector('[data-mobile-calendar] header');
            const buttons = [...header.querySelectorAll('button')];
            const today = buttons.find(button => button.textContent === 'Today');
            const nav = [...today.parentElement.querySelectorAll('button')].map(button => button.getBoundingClientRect());
            const minimum = elements => [...elements].reduce((sizes, element) => { const r = element.getBoundingClientRect(); return [Math.min(sizes[0], r.width), Math.min(sizes[1], r.height)]; }, [Infinity, Infinity]);
            const headerTargets = minimum(buttons);
            const headerHeight = d.querySelector('[data-mobile-site-nav]').getBoundingClientRect().height;
            const stripTargets = minimum(d.querySelectorAll('[aria-label="Current week"] button'));
            const select = async mode => {
                d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
                d.querySelector(`[data-calendar-view="${mode}"]`).click(); await wait();
            };
            await select('month');
            const monthTargets = minimum(d.querySelectorAll('[aria-label="Month dates"] button'));
            await select('list');
            const agenda = d.querySelector('[aria-label="Chronological agenda"]');
            const row = agenda.querySelector('li button');
            const rowStyle = w.getComputedStyle(row);
            return { headerTargets, headerHeight, stripTargets, monthTargets, viewportWidth: d.documentElement.clientWidth,
                navGaps: [nav[1].left - nav[0].right, nav[2].left - nav[1].right],
                rowHeight: row.getBoundingClientRect().height, rowPadding: [rowStyle.paddingTop, rowStyle.paddingBottom],
                sectionGap: agenda.children[1].getBoundingClientRect().top - agenda.children[0].getBoundingClientRect().bottom,
            };
        });
        assert.ok(result.headerTargets[0] >= 43.9 && result.headerTargets[1] >= 44, JSON.stringify(result));
        // Preserve the existing seven-column geometry: 24px main insets and
        // 16px negative grid margins. Desktop Firefox reserves a scrollbar,
        // making the narrowest fixture's day cells smaller than 44px.
        const dayWidth = Math.min(44, (result.viewportWidth - 16) / 7);
        for (const target of [result.stripTargets, result.monthTargets]) assert.ok(target[0] >= dayWidth - 0.1 && target[1] >= 44, JSON.stringify(result));
        assert.ok(result.headerHeight < 96, JSON.stringify(result));
        assert.ok(result.navGaps.every(gap => gap >= 1.9), JSON.stringify(result));
        assert.ok(result.rowHeight >= 72);
        assert.deepEqual(result.rowPadding, ['16px', '16px']);
        assert.equal(result.sectionGap, 24);
    }
});

test('mobile timeline colours match desktop classes, grading and availability in both themes', async () => {
    for (const date of ['2026-11-4', '2026-11-7']) {
        const result = await inCalendar(390, `/instructor/calendar?view=day&date=${date}`, async (w, wait, f) => {
            const d = w.document;
            const colours = element => {
                const style = w.getComputedStyle(element);
                return [style.backgroundColor, style.color, style.borderLeftColor];
            };
            const comparisons = [];
            for (const dark of [false, true]) {
                d.documentElement.classList.toggle('dark', dark);
                await wait();
                const mobile = [...d.querySelectorAll('[data-mobile-event]')].map(element => ({ name: element.getAttribute('aria-label').split(',')[0], colours: colours(element) }));
                f.style.width = '1280px'; await wait(500);
                const desktop = [...d.querySelectorAll('button[aria-label]')].filter(element => element.getAttribute('aria-label').endsWith('View details'));
                comparisons.push(...mobile.map(item => ({ name: item.name, dark, mobile: item.colours, desktop: colours(desktop.find(element => element.getAttribute('aria-label').startsWith(item.name + ','))) })));
                f.style.width = '390px'; await wait(500);
            }
            return comparisons;
        });
        assert.ok(result.length > 0);
        for (const comparison of result) assert.deepEqual(comparison.mobile, comparison.desktop, `${comparison.name}, dark=${comparison.dark}`);
    }
});

test('month selection stays in month, week-strip paging and day swipes keep date state', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=month&date=2026-11-4', async (w, wait) => {
        const d = w.document;
        d.querySelector('[aria-label="Month dates"] button[aria-label^="12 November"]').click();
        await wait();
        const month = w.location.search;
        const heading = d.querySelector('[data-mobile-calendar] h2').textContent;
        d.querySelector('[aria-label="Change calendar view"]').click(); await wait();
        d.querySelector('[data-calendar-view="multi-day"]').click();
        await wait();
        const strip = d.querySelector('[aria-label="Swipe to change week"]');
        strip.scrollLeft = 2 * strip.clientWidth;
        await wait(500);
        const week = w.location.search;
        const schedule = d.querySelector('.touch-pan-y');
        for (const [type, x] of [['pointerdown', 250], ['pointermove', 100], ['pointerup', 80]]) schedule.dispatchEvent(new w.PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 200 }));
        await wait();
        const day = w.location.search;
        return { month, heading, week, day, dialog: !!d.querySelector('[data-slot="dialog-content"]') };
    });
    assert.match(result.month, /view=month/);
    assert.match(result.month, /date=2026-11-12/);
    assert.match(result.heading, /12 November/);
    assert.match(result.week, /date=2026-11-19/);
    assert.match(result.day, /date=2026-11-20/);
    assert.equal(result.dialog, false);
});

test('the second day opens its own UUID class and saves availability on the selected day', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=week&date=2026-11-27', async (w, wait) => {
        const d = w.document;
        const second = d.querySelector('[data-mobile-timeline-day="2026-11-28"]');
        second.querySelector('[data-mobile-event]').click(); await wait();
        const selectedClass = w.location.search;
        const uuid = new URLSearchParams(w.location.search).get('session');
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const classTitle = drawer.textContent;
        drawer.querySelector('[data-slot="drawer-header"] button').click(); await wait(500);
        // Selecting the second day's class advances the shared selected date.
        d.querySelector('[data-mobile-timeline-day="2026-11-28"] [data-mobile-free-slot]:not(:disabled)').click(); await wait();
        const inputDate = d.getElementById('availability-date').value;
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait(700);
        return { selectedClass, classTitle,
            uuid,
            inputDate,
            saved: !!d.querySelector('[data-mobile-timeline-day="2026-11-28"] [data-mobile-event][aria-label^="Available"]'),
            dialog: !!d.querySelector('[data-slot="dialog-content"]') };
    });
    assert.match(result.selectedClass, /date=2026-11-28/);
    assert.match(result.classTitle, /Weapons/);
    assert.match(result.uuid, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    assert.equal(result.inputDate, '2026-11-28');
    assert.equal(result.saved, true);
    assert.equal(result.dialog, false);
});

test('Today returns to the current date and refocuses the document timeline', async () => {
    for (const [width, height] of [[390, 700], [568, 320], [844, 390]]) {
        const result = await inCalendar(width, '/instructor/calendar?view=day&date=2026-11-27', async (w, wait) => {
            const d = w.document;
            [...d.querySelectorAll('button')].find(e => e.textContent === 'Today').click();
            await wait(1000);
            const marker = d.querySelector('[role="img"][aria-label^="Current time:"]');
            const rect = marker?.getBoundingClientRect();
            const headerBottom = d.querySelector('[data-mobile-site-nav]').getBoundingClientRect().bottom;
            return { date: w.location.search, label: marker?.getAttribute('aria-label'), markerVisible: !!rect && rect.top > headerBottom && rect.top < w.innerHeight };
        }, height);
        assert.match(result.date, /date=2026-11-3/);
        assert.match(result.label, /9:00 AM/);
        assert.equal(result.markerVisible, true);
    }
});

test('recorded attendance survives resize with editable controls and the drawer restores focus', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=week&date=2026-11-27', async (w, wait, f) => {
        const d = w.document;
        const trigger = d.querySelector('[data-mobile-event]');
        trigger.focus(); trigger.click(); await wait();
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const rect = drawer.getBoundingClientRect();
        const present = drawer.querySelector('button[aria-label^="Mark "][aria-label*=" present"]');
        const student = present.getAttribute('aria-label').split(' present')[0];
        const before = present.getAttribute('aria-pressed');
        const readOnly = [...drawer.querySelectorAll('button[aria-label^="Mark "]')].every(button => button.disabled);
        const bulkDisabled = [...drawer.querySelectorAll('button')].filter(e => e.textContent.includes('Mark All')).every(button => button.disabled);
        const marked = present.getAttribute('aria-pressed');
        const lateBadge = drawer.querySelector('[aria-label$=": Late"]');
        const late = { text: lateBadge?.textContent, colour: w.getComputedStyle(lateBadge).backgroundColor };
        const session = w.location.search;
        const note = drawer.querySelector('button[aria-label^="View student details and techniques for"]')?.getAttribute('aria-haspopup');
        f.style.width = '1280px'; await wait(500);
        const desktop = { drawer: !!d.querySelector('[data-slot="drawer-content"]'), session: w.location.search, marked: [...d.querySelectorAll('button[aria-label]')].find(e => e.getAttribute('aria-label')?.startsWith(student + ' present'))?.getAttribute('aria-pressed') };
        f.style.width = '320px'; await wait(500);
        const reopened = d.querySelector('[data-slot="drawer-content"]');
        const rosters = d.querySelectorAll('[aria-label="Student roster"]').length;
        reopened.querySelector('[data-slot="drawer-header"] button').click(); await wait(500);
        return { top: rect.top, right: rect.right, width: w.innerWidth, marked, before, readOnly, bulkDisabled, late, session, note, desktop, rosters, closed: !d.querySelector('[data-slot="drawer-content"]'), after: w.location.search, focused: Boolean(d.activeElement?.closest('[data-mobile-calendar]')) };
    });
    assert.ok(result.top >= 0 && result.right <= result.width + 1);
    assert.equal(result.marked, 'true');
    assert.equal(result.marked, result.before);
    assert.equal(result.readOnly, false);
    assert.equal(result.bulkDisabled, false);
    assert.equal(result.late.text, 'Late');
    assert.notEqual(result.late.colour, 'rgba(0, 0, 0, 0)');
    assert.equal(result.desktop.drawer, false);
    assert.equal(result.desktop.marked, 'true');
    assert.equal(result.desktop.session, result.session);
    assert.equal(result.note, 'dialog');
    assert.equal(result.rosters, 1);
    assert.equal(result.closed, true);
    assert.doesNotMatch(result.after, /session=/);
    assert.match(result.after, /date=2026-11-27/);
    assert.match(result.after, /view=week/);
    assert.equal(result.focused, true);
});

test('past classes remain read-only and retain student-details modal triggers', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=day&date=2026-10-27', async (w, wait) => {
        const d = w.document;
        d.querySelector('[data-mobile-event]').click(); await wait();
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const ids = [...d.querySelectorAll('[id]')].map(e => e.id);
        return { editable: drawer.querySelectorAll('button[aria-label^="Mark "]').length,
            bulk: [...drawer.querySelectorAll('button')].some(e => e.textContent.includes('Mark All')),
            notes: [...drawer.querySelectorAll('button[aria-label^="View student details and techniques for"]')].map(e => e.getAttribute('aria-haspopup')),
            duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
            nameCount: drawer.querySelectorAll('[aria-label="Student roster"] li').length };
    });
    assert.equal(result.editable, 0);
    assert.equal(result.bulk, false);
    assert.ok(result.nameCount > 0);
    assert.equal(result.notes.length, result.nameCount);
    assert.ok(result.notes.every(popup => popup === 'dialog'));
    assert.deepEqual(result.duplicateIds, []);
});

test('recorded availability opens in the same dialog with mutations disabled', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-4', async (w, wait) => {
        const d = w.document;
        d.querySelector('[data-mobile-event][aria-label^="Available"]').click(); await wait();
        const dialog = d.querySelector('[data-slot="dialog-content"]');
        const style = w.getComputedStyle(dialog);
        const result = { date: d.getElementById('availability-date').value, start: d.getElementById('availability-start').value,
            end: d.getElementById('availability-end').value, fieldsDisabled: [...dialog.querySelectorAll('input')].every(input => input.disabled),
            buttonsDisabled: [...dialog.querySelectorAll('button')].filter(button => /Save changes|Delete/.test(button.textContent)).every(button => button.disabled),
            padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft] };
        dialog.querySelector('form').requestSubmit(); await wait();
        return { ...result, stillOpen: !!d.querySelector('[data-slot="dialog-content"]'), changed: d.getElementById('availability-start').value !== result.start };
    });
    assert.equal(result.date, '2026-11-04');
    assert.equal(result.start, '09:00');
    assert.equal(result.end, '11:00');
    assert.equal(result.fieldsDisabled, true);
    assert.equal(result.buttonsDisabled, true);
    assert.equal(result.stillOpen, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.padding, ['16px', '16px', '16px', '16px']);
});

test('legacy selection, browser history and short landscapes retain a reachable drawer and one roster', async () => {
    for (const [width, height] of [[320, 568], [568, 320], [844, 390]]) {
        const result = await inCalendar(width, '/instructor/dashboard?view=month&date=2026-11-27&class=00000000-0000-4000-8000-202611270006', async (w, wait) => {
            const d = w.document;
            const drawer = d.querySelector('[data-slot="drawer-content"]');
            const bounds = drawer.getBoundingClientRect();
            const body = drawer.querySelector('.overflow-y-auto');
            body.scrollTop = body.scrollHeight;
            const lastAction = body.querySelector('button')?.textContent;
            drawer.querySelector('[data-slot="drawer-header"] button').click(); await wait(500);
            const after = w.location.search;
            w.history.back(); await wait(500);
            return { top: bounds.top, bottom: bounds.bottom, height: w.innerHeight, after, reopened: !!d.querySelector('[data-slot="drawer-content"]'), rosters: d.querySelectorAll('[aria-label="Student roster"]').length, overflow: d.documentElement.scrollWidth > d.documentElement.clientWidth, lastAction };
        }, height);
        assert.ok(result.top >= 0 && result.bottom <= result.height + 1);
        assert.doesNotMatch(result.after, /class=/);
        assert.match(result.after, /view=month/);
        assert.equal(result.reopened, true);
        assert.equal(result.rosters, 1);
        assert.equal(result.overflow, false);
    }
});

test('calendar loading, empty and error/retry states never substitute fixture events', async () => {
    const loading = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27&fixtureData=loading', async (w, wait) => {
        const d = w.document;
        const pending = { text: d.querySelector('main [role="status"]')?.textContent, events: d.querySelectorAll('[data-mobile-event]').length };
        await wait(1800);
        return { pending, loaded: d.querySelectorAll('[data-mobile-event]').length };
    });
    assert.match(loading.pending.text, /Loading/);
    assert.equal(loading.pending.events, 0);
    assert.ok(loading.loaded > 0);
    for (const width of [390, 1280]) for (const view of ['day', 'month']) {
        const empty = await inCalendar(width, `/instructor/calendar?view=${view}&date=2026-11-27&fixtureData=empty`, async w => ({
            text: w.document.querySelector('main').textContent,
            rosters: w.document.querySelectorAll('[aria-label="Student roster"]').length,
            timeline: !!w.document.querySelector('[aria-label="Selected day hourly timeline"], [aria-label="Daily hourly timeline"]'),
            events: w.document.querySelectorAll('[data-mobile-event], button[aria-label$="View details"]').length,
        }));
        // The current day-view design expresses empty data with a usable blank
        // timeline. Month views also have an explicit empty-state message.
        if (view === 'month') assert.match(empty.text, /No classes or availability/);
        else assert.equal(empty.timeline, true);
        assert.equal(empty.events, 0);
        assert.equal(empty.rosters, 0);
    }
    const retry = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27&fixtureData=calendar-error', async (w, wait) => {
        const d = w.document;
        const errorMessage = d.querySelector('main [role="alert"]')?.textContent;
        const initialEvents = d.querySelectorAll('[data-mobile-event]').length;
        [...d.querySelectorAll('button')].find(button => button.textContent === 'Try again').click(); await wait(500);
        return { errorMessage, initialEvents, events: d.querySelectorAll('[data-mobile-event]').length };
    });
    assert.match(retry.errorMessage, /Calendar could not be loaded/);
    assert.equal(retry.initialEvents, 0);
    assert.ok(retry.events > 0);
});

test('roster reads expose empty/error states and load every page beyond 100 students', async () => {
    for (const mode of ['empty-roster', 'roster-error', 'large-roster']) {
        const result = await inCalendar(390, `/instructor/calendar?view=day&date=2026-11-27&fixtureData=${mode}`, async (w, wait) => {
            const d = w.document;
            d.querySelector('[data-mobile-event]').click(); await wait(500);
            const initial = d.querySelector('[data-slot="drawer-content"]').textContent;
            const retry = [...d.querySelectorAll('button')].find(button => button.textContent === 'Try again');
            if (retry) { retry.click(); await wait(500); }
            return { initial, rows: d.querySelectorAll('[aria-label="Student roster"] li').length, overflow: d.documentElement.scrollWidth > d.documentElement.clientWidth };
        });
        if (mode === 'empty-roster') { assert.match(result.initial, /No students are registered/); assert.equal(result.rows, 0); }
        if (mode === 'roster-error') { assert.match(result.initial, /Roster could not be loaded/); assert.ok(result.rows > 0); }
        if (mode === 'large-roster') assert.equal(result.rows, 205);
        assert.equal(result.overflow, false);
    }
});

test('slow previous-date responses cannot overwrite a newer calendar selection', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27&fixtureData=race', async (w, wait) => {
        const d = w.document;
        d.querySelector('[aria-label="Next day"]').click(); await wait(300);
        const before = [...d.querySelectorAll('[data-mobile-event]')].map(event => event.getAttribute('aria-label'));
        await wait(1300);
        return { date: w.location.search, before, after: [...d.querySelectorAll('[data-mobile-event]')].map(event => event.getAttribute('aria-label')) };
    });
    assert.match(result.date, /date=2026-11-28/);
    assert.ok(result.before.length > 0);
    assert.deepEqual(result.after, result.before);
});

test('account changes clear the previous calendar and selected roster before the replacement request resolves', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27', async (w, wait) => {
        const d = w.document;
        d.querySelector('[data-mobile-event]').click(); await wait();
        const hadRoster = d.querySelectorAll('[aria-label="Student roster"] li').length > 0;
        w.switchInstructorFixture(); await wait(100);
        const pending = { roster: d.querySelectorAll('[aria-label="Student roster"] li').length,
            stale: d.querySelector('main').textContent.includes('Mixed/Family') };
        // Close the old account's now-unavailable selection using date navigation.
        d.querySelector('[aria-label="Next day"]').click(); await wait(1100);
        return { hadRoster, pending, events: [...d.querySelectorAll('[data-mobile-event]')].map(event => event.textContent) };
    });
    assert.equal(result.hadRoster, true);
    assert.equal(result.pending.roster, 0);
    assert.equal(result.pending.stale, false);
    assert.ok(result.events.length > 0);
    assert.ok(result.events.every(name => name.includes('Replacement account class')));
});

test('part-time instructors keep a navigable calendar and can save availability once', async () => {
    for (const width of [320, 1280]) {
        const result = await inCalendar(width, '/instructor/calendar?view=day&date=2026-11-27&fixtureData=part-time', async (w, wait) => {
            const d = w.document;
            const hasCalendar = !!d.querySelector('[data-mobile-calendar], [aria-label="Daily hourly timeline"]');
            const add = [...d.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add Availability');
            const enabled = !add.disabled;
            add.click(); await wait();
            const form = d.querySelector('[data-slot="dialog-content"] form');
            const date = d.getElementById('availability-date').value;
            form.requestSubmit(); form.requestSubmit(); await wait(50);
            const pending = form.getAttribute('aria-busy') === 'true' && form.querySelector('button[type="submit"]').disabled;
            await wait(700);
            return { hasCalendar, enabled, date, pending,
                saved: d.querySelectorAll('button[aria-label^="Available,"]').length,
                closed: !d.querySelector('[data-slot="dialog-content"]'),
                errors: [...d.querySelectorAll('main [role="alert"]')].map(element => element.textContent) };
        });
        assert.equal(result.hasCalendar, true);
        assert.equal(result.enabled, true);
        assert.equal(result.date, '2026-11-27');
        assert.equal(result.pending, true);
        assert.equal(result.saved, 1);
        assert.equal(result.closed, true);
        assert.deepEqual(result.errors, []);
    }
});

test('full-time, unset and unlinked instructors have no availability controls, records or reads on mobile and desktop', async () => {
    for (const mode of ['full-time', 'employment-unset', 'unlinked']) for (const width of [320, 390, 1280]) {
        const result = await inCalendar(width, `/instructor/calendar?view=day&date=2026-11-4&fixtureData=${mode}`, async (w, wait) => {
            const d = w.document;
            const addButtons = [...d.querySelectorAll('button')].filter(button => button.textContent.includes('Add Availability') || button.getAttribute('aria-label')?.startsWith('Add availability'));
            const records = d.querySelectorAll('button[aria-label^="Available,"]').length;
            const enabledSlots = d.querySelectorAll('[data-mobile-free-slot]:not(:disabled), [data-empty-slot]:not(:disabled)').length;
            const info = d.querySelector('[aria-label="Calendar colours"], [aria-label="Calendar information"]');
            info.click(); await wait();
            const legend = d.querySelector('[data-slot="popover-content"]').textContent;
            return { addButtons: addButtons.length, records, enabledSlots, legendHasAvailability: legend.includes('Availability'),
                reads: w.availabilityReadsFixture, writes: w.availabilityWritesFixture,
                hasCalendar: Boolean(d.querySelector('[data-mobile-calendar], [aria-label="Daily hourly timeline"]')),
                fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth };
        });
        for (const key of ['addButtons', 'records', 'enabledSlots', 'reads', 'writes']) assert.equal(result[key], 0, `${mode}/${width}: ${key}`);
        assert.equal(result.legendHasAvailability, false);
        assert.equal(result.hasCalendar, true);
        assert.equal(result.fits, true);
    }
});

test('failed availability saves keep the draft for retry and never show a locally saved slot', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27&fixtureData=availability-error', async (w, wait) => {
        const d = w.document;
        [...d.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add Availability').click(); await wait();
        const before = [d.getElementById('availability-date').value, d.getElementById('availability-start').value, d.getElementById('availability-end').value];
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait(400);
        const errorMessage = d.querySelector('[data-slot="dialog-content"] [role="alert"]')?.textContent;
        const after = [d.getElementById('availability-date').value, d.getElementById('availability-start').value, d.getElementById('availability-end').value];
        const falselySaved = d.querySelectorAll('button[aria-label^="Available,"]').length;
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait(700);
        return { before, after, errorMessage, falselySaved, saved: d.querySelectorAll('button[aria-label^="Available,"]').length };
    });
    assert.deepEqual(result.after, result.before);
    assert.match(result.errorMessage, /Availability could not be saved/);
    assert.equal(result.falselySaved, 0);
    assert.equal(result.saved, 1);
});

test('an old availability response cannot navigate or populate the replacement account', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27', async (w, wait) => {
        const d = w.document;
        [...d.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add Availability').click(); await wait();
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit();
        w.switchInstructorFixture(); await wait(50);
        d.querySelector('[aria-label="Next day"]').click(); await wait(1100);
        return { date: w.location.search, slots: d.querySelectorAll('button[aria-label^="Available,"]').length,
            dialog: !!d.querySelector('[data-slot="dialog-content"]'),
            events: [...d.querySelectorAll('[data-mobile-event]')].map(event => event.textContent) };
    });
    assert.match(result.date, /date=2026-11-28/);
    assert.equal(result.slots, 0);
    assert.equal(result.dialog, false);
    assert.ok(result.events.length > 0);
    assert.ok(result.events.every(name => name.includes('Replacement account class')));
});
