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
        ['/admin?fixtureRole=administrator', 'Administrator', ['Dashboard']],
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
                description: sheet.querySelector('[data-slot="sheet-description"]').textContent,
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
});

test('mobile main content and overlays use 16px insets, and roster identity, grade and actions share one line', async () => {
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
            [...d.querySelectorAll('button')].find(button => button.textContent.includes('Add Availability')).click(); await wait();
            output.dialog = inset(d.querySelector('[data-slot="dialog-content"]'));
            return output;
        });
        for (const padding of [result.main, result.legend, result.drawerBody, result.identityPadding, result.dialog]) assert.deepEqual(padding, ['16px', '16px', '16px', '16px']);
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
            return { headerTargets, headerHeight, stripTargets, monthTargets,
                navGaps: [nav[1].left - nav[0].right, nav[2].left - nav[1].right],
                rowHeight: row.getBoundingClientRect().height, rowPadding: [rowStyle.paddingTop, rowStyle.paddingBottom],
                sectionGap: agenda.children[1].getBoundingClientRect().top - agenda.children[0].getBoundingClientRect().bottom,
            };
        });
        for (const target of [result.headerTargets, result.stripTargets, result.monthTargets]) assert.ok(target[0] >= 43.9 && target[1] >= 44, JSON.stringify(result));
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

test('the second day opens its own class and creates availability on the correct date', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=week&date=2026-11-27', async (w, wait) => {
        const d = w.document;
        const second = d.querySelector('[data-mobile-timeline-day="2026-11-28"]');
        second.querySelector('[data-mobile-event]').click(); await wait();
        const selectedClass = w.location.search;
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const classTitle = drawer.textContent;
        drawer.querySelector('[data-slot="drawer-header"] button').click(); await wait(500);
        // Selecting the second day's class advances the shared selected date.
        d.querySelector('[data-mobile-timeline-day="2026-11-28"] [data-mobile-free-slot]:not(:disabled)').click(); await wait();
        const inputDate = d.getElementById('availability-date').value;
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait();
        return { selectedClass, classTitle, inputDate,
            available: !!d.querySelector('[data-mobile-timeline-day="2026-11-28"] [data-mobile-event][aria-label^="Available"]') };
    });
    assert.match(result.selectedClass, /date=2026-11-28/);
    assert.match(result.classTitle, /Weapons/);
    assert.equal(result.inputDate, '2026-11-28');
    assert.equal(result.available, true);
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

test('drawer attendance persists across resize, closes with date/view intact and restores focus', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=week&date=2026-11-27', async (w, wait, f) => {
        const d = w.document;
        const trigger = d.querySelector('[data-mobile-event]');
        trigger.focus(); trigger.click(); await wait();
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const rect = drawer.getBoundingClientRect();
        const present = drawer.querySelector('button[aria-label^="Mark "][aria-label*=" present"]');
        const student = present.getAttribute('aria-label').split(' present')[0];
        present.click(); await wait();
        present.click(); await wait();
        const cleared = present.getAttribute('aria-pressed');
        [...drawer.querySelectorAll('button')].find(e => e.textContent.includes('Mark All Present')).click(); await wait();
        const allPresent = [...drawer.querySelectorAll('button[aria-label^="Mark "][aria-label*=" present"]')].every(e => e.getAttribute('aria-pressed') === 'true');
        [...drawer.querySelectorAll('button')].find(e => e.textContent.includes('Mark All Absent')).click(); await wait();
        const allAbsent = [...drawer.querySelectorAll('button[aria-label^="Mark "][aria-label*=" absent"]')].every(e => e.getAttribute('aria-pressed') === 'true');
        present.click(); await wait();
        const marked = present.getAttribute('aria-pressed');
        const session = w.location.search;
        const note = drawer.querySelector('a[href*="/instructor/students/"]')?.getAttribute('href');
        f.style.width = '1280px'; await wait(500);
        const desktop = { drawer: !!d.querySelector('[data-slot="drawer-content"]'), session: w.location.search, marked: [...d.querySelectorAll('button[aria-label]')].find(e => e.getAttribute('aria-label')?.startsWith(student + ' present'))?.getAttribute('aria-pressed') };
        f.style.width = '320px'; await wait(500);
        const reopened = d.querySelector('[data-slot="drawer-content"]');
        const rosters = d.querySelectorAll('[aria-label="Student roster"]').length;
        reopened.querySelector('[data-slot="drawer-header"] button').click(); await wait(500);
        return { top: rect.top, right: rect.right, width: w.innerWidth, marked, cleared, allPresent, allAbsent, session, note, desktop, rosters, closed: !d.querySelector('[data-slot="drawer-content"]'), after: w.location.search, focused: Boolean(d.activeElement?.closest('[data-mobile-calendar]')) };
    });
    assert.ok(result.top >= 0 && result.right <= result.width + 1);
    assert.equal(result.marked, 'true');
    assert.equal(result.cleared, 'false');
    assert.equal(result.allPresent, true);
    assert.equal(result.allAbsent, true);
    assert.equal(result.desktop.drawer, false);
    assert.equal(result.desktop.marked, 'true');
    assert.equal(result.desktop.session, result.session);
    assert.match(result.note, /tab=sessions/);
    assert.equal(result.rosters, 1);
    assert.equal(result.closed, true);
    assert.doesNotMatch(result.after, /session=/);
    assert.match(result.after, /date=2026-11-27/);
    assert.match(result.after, /view=week/);
    assert.equal(result.focused, true);
});

test('past classes remain read-only and retain student/session note links', async () => {
    const result = await inCalendar(320, '/instructor/calendar?view=day&date=2026-10-27', async (w, wait) => {
        const d = w.document;
        d.querySelector('[data-mobile-event]').click(); await wait();
        const drawer = d.querySelector('[data-slot="drawer-content"]');
        const ids = [...d.querySelectorAll('[id]')].map(e => e.id);
        return { editable: drawer.querySelectorAll('button[aria-label^="Mark "]').length,
            bulk: [...drawer.querySelectorAll('button')].some(e => e.textContent.includes('Mark All')),
            notes: [...drawer.querySelectorAll('a[href*="/instructor/students/"]')].map(e => e.getAttribute('href')),
            duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
            nameCount: drawer.querySelectorAll('[aria-label="Student roster"] li').length };
    });
    assert.equal(result.editable, 0);
    assert.equal(result.bulk, false);
    assert.ok(result.nameCount > 0);
    assert.ok(result.notes.every(href => href.includes('tab=sessions') && href.includes('session=') && href.includes('date=2026-10-27')));
    assert.deepEqual(result.duplicateIds, []);
});

test('availability can be created, edited, validated and deleted by tapping', async () => {
    const result = await inCalendar(390, '/instructor/calendar?view=day&date=2026-11-27', async (w, wait) => {
        const d = w.document;
        const click = text => [...d.querySelectorAll('button')].find(e => e.textContent.trim() === text).click();
        const set = (id, value) => { const input = d.getElementById(id); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
        d.querySelector('[data-mobile-free-slot]:not(:disabled)').click(); await wait();
        const start = d.getElementById('availability-start').value;
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait();
        let available = d.querySelector('[data-mobile-event][aria-label^="Available"]');
        const created = !!available;
        available.click(); await wait();
        set('availability-end', '09:30'); await wait();
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait();
        available = d.querySelector('[data-mobile-event][aria-label^="Available"]');
        const edited = available.getAttribute('aria-label');
        available.click(); await wait();
        set('availability-start', '18:00'); set('availability-end', '18:30'); await wait();
        d.querySelector('[data-slot="dialog-content"] form').requestSubmit(); await wait();
        const validationError = d.querySelector('[role="alert"]')?.textContent;
        click('Delete'); await wait();
        return { start, created, edited, validationError, deleted: !d.querySelector('[data-mobile-event][aria-label^="Available"]') };
    });
    assert.equal(result.start, '08:00');
    assert.equal(result.created, true);
    assert.match(result.edited, /9:30 AM/);
    assert.ok(result.validationError);
    assert.equal(result.deleted, true);
});

test('legacy selection, browser history and short landscapes retain a reachable drawer and one roster', async () => {
    for (const [width, height] of [[320, 568], [568, 320], [844, 390]]) {
        const result = await inCalendar(width, '/instructor/dashboard?view=month&date=2026-11-27&class=mixed-family-fri-2026-11-27', async (w, wait) => {
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
