import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const webdriver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
let session
async function request(path, body, method = 'POST') {
  const response = await fetch(`${webdriver}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const result = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(result))
  return result.value
}
before(async () => {
  const result = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } })
  session = result.sessionId
  await request(`/session/${session}/timeouts`, { script: 30_000 })
})
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE') })

async function visit(width = 390, role = 'instructor', height = 844) {
  await request(`/session/${session}/window/rect`, { width: Math.max(width, 600), height })
  const route = `/instructor/calendar?fixtureChat=true&fixtureRole=${role}`
  await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html?route=${encodeURIComponent(route)}` })
  return run(async (_w, wait) => { await wait(800); return true })
}
async function run(inspect) {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
    (${inspect.toString()})(window, wait).then(done).catch(error => done({ error: String(error) }));` })
  assert.equal(result?.error, undefined, result?.error)
  return result
}

test('chat is visible only in instructor layout and does not duplicate the launcher', async () => {
  for (const role of ['instructor', 'student', 'administrator', 'guest']) {
    await visit(390, role)
    assert.equal(await run(async w => w.document.querySelectorAll('[data-floating-chatbot]').length), role === 'instructor' ? 1 : 0)
  }
})

test('send, retry and keyboard close preserve a real conversation without showing sources', async () => {
  await visit()
  const result = await run(async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Open DojoGPT"]').click(); await wait()
    const input = d.querySelector('textarea')
    const focused = d.activeElement === input
    const set = value => { Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new w.Event('input', { bubbles: true })) }
    set('What classes am I teaching tomorrow?'); await wait()
    d.querySelector('[aria-label="Send message"]').click(); await wait()
    const success = d.querySelector('[aria-label="Chat messages"]').textContent
    const sourcesVisible = !!d.querySelector('[aria-label="Source records"]')
    w.chatFixture.mode = 'error'
    set('What about next week?'); await wait()
    d.querySelector('[aria-label="Send message"]').click(); await wait()
    const failed = d.querySelector('[role="alert"]')?.textContent
    w.chatFixture.mode = 'ok'
    const userCount = [...d.querySelectorAll('[aria-label="Chat messages"] .sr-only')].filter(e => e.textContent.startsWith('You')).length
    ;[...d.querySelectorAll('button')].find(e => e.textContent === 'Retry reply').click(); await wait()
    const afterRetry = [...d.querySelectorAll('[aria-label="Chat messages"] .sr-only')].filter(e => e.textContent.startsWith('You')).length
    const recovered = !d.querySelector('[role="alert"]')
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait()
    const closed = !!d.querySelector('[aria-label="Open DojoGPT"]') && d.activeElement === d.querySelector('[aria-label="Open DojoGPT"]')
    return { focused, success, sourcesVisible, failed, userCount, afterRetry, recovered, closed, path: w.location.pathname, calls: w.chatFixture.calls.length }
  })
  assert.equal(result.focused, true)
  assert.match(result.success, /10:00 AM/)
  assert.equal(result.sourcesVisible, false)
  assert.match(result.failed, /unavailable/)
  assert.equal(result.afterRetry, result.userCount)
  assert.equal(result.recovered, true)
  assert.equal(result.closed, true)
  assert.equal(result.path, '/instructor/calendar')
  assert.equal(result.calls, 3)
})

test('starter topics and follow-ups send real chat prompts without duplicate requests or lost drafts', async () => {
  await visit()
  const result = await run(async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Open DojoGPT"]').click(); await wait()
    const starters = [...d.querySelectorAll('[aria-label="Suggested questions"] button')].map(button => button.textContent.trim())
    const starterGroup = d.querySelector('[aria-label="Suggested questions"]')
    const greeting = starterGroup.closest('[data-chat-greeting]')
    const initial = { calls: w.chatFixture.calls.length, inGreeting: !!greeting,
      greetingText: greeting?.textContent, outlined: starterGroup.querySelector('button').classList.contains('border-border'),
      beforeTimestamp: !!(starterGroup.compareDocumentPosition(greeting.querySelector('time')) & w.Node.DOCUMENT_POSITION_FOLLOWING) }
    const input = d.querySelector('textarea')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'My unfinished question')
    input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait()
    w.chatFixture.mode = 'pending'
    const today = d.querySelector('[aria-label="Suggested questions"] button')
    today.click(); today.click(); await wait()
    const pending = { calls: w.chatFixture.calls.length, suggestions: d.querySelectorAll('[aria-label="Suggested questions"], [aria-label="Follow-up questions"]').length, draft: input.value }
    w.chatFixture.release(); await wait()
    const followUps = [...d.querySelectorAll('[aria-label="Follow-up questions"] button')].map(button => button.textContent.trim())
    const followUpGroup = d.querySelector('[aria-label="Follow-up questions"]')
    const responseRow = followUpGroup.closest('[data-chat-message="assistant"]')
    const followUpPlacement = !!responseRow && !responseRow.hasAttribute('data-chat-greeting')
      && !!(followUpGroup.compareDocumentPosition(responseRow.querySelector('time')) & w.Node.DOCUMENT_POSITION_FOLLOWING)
      && !d.querySelector('[data-chat-greeting] [role="group"]')
    const question = w.chatFixture.calls[0].messages.at(-1)
    const displayQuestion = d.querySelector('[data-chat-message="user"] p').textContent
    const sentTurns = w.chatFixture.calls[0].messages.length
    w.chatFixture.mode = 'ok'
    d.querySelector('[aria-label="Follow-up questions"] button').click(); await wait()
    const second = w.chatFixture.calls[1].messages.at(-1).content
    const draft = input.value
    d.querySelector('[aria-label="New conversation"]').click(); await wait()
    const resetCount = d.querySelectorAll('[aria-label="Suggested questions"] button').length
    d.querySelector('[aria-label="Suggested questions"] [data-chat-topic="attendance"]').focus()
    return { starters, initial, pending, followUps, followUpPlacement, question, displayQuestion, sentTurns, second, draft, resetCount }
  })
  assert.deepEqual(result.starters, ['What classes am I teaching today?', 'What’s on my schedule this week?', 'How is this student’s attendance?', 'What sessions has this student attended?'])
  assert.equal(result.initial.calls, 0)
  assert.equal(result.initial.inGreeting, true)
  assert.match(result.initial.greetingText, /Hi, I’m DojoGPT/)
  assert.equal(result.initial.outlined, true)
  assert.equal(result.initial.beforeTimestamp, true)
  assert.equal(result.pending.calls, 1)
  assert.equal(result.pending.suggestions, 0)
  assert.equal(result.pending.draft, 'My unfinished question')
  assert.deepEqual(result.followUps, ['What’s on my schedule this week?', 'How is this student’s attendance?', 'What sessions has this student attended?'])
  assert.equal(result.followUpPlacement, true)
  assert.deepEqual(result.question, { role: 'user', content: 'What classes and events am I assigned to today?' })
  assert.equal(result.displayQuestion, 'What classes am I teaching today?')
  assert.equal(result.sentTurns, 1)
  assert.match(result.second, /this week/)
  assert.equal(result.draft, 'My unfinished question')
  assert.equal(result.resetCount, 4)

  // Native keyboard activation, rather than a synthetic click, for a topic.
  await request(`/session/${session}/actions`, { actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value: '\uE007' }, { type: 'keyUp', value: '\uE007' }] }] })
  const keyboard = await run(async (w, wait) => {
    await wait()
    const d = w.document
    const prompt = w.chatFixture.calls.at(-1).messages.at(-1).content
    w.chatFixture.mode = 'error'
    d.querySelector('[aria-label="Follow-up questions"] button').click(); await wait()
    const hiddenOnError = !d.querySelector('[aria-label="Follow-up questions"]') && !!d.querySelector('[role="alert"]')
    w.chatFixture.mode = 'ok'
    ;[...d.querySelectorAll('button')].find(button => button.textContent === 'Retry reply').click(); await wait()
    return { prompt, hiddenOnError, recovered: d.querySelectorAll('[aria-label="Follow-up questions"] button').length }
  })
  assert.match(keyboard.prompt, /ask me for a name or membership number first/i)
  assert.equal(keyboard.hiddenOnError, true)
  assert.equal(keyboard.recovered, 3)
})

test('stop, clear and account switch abort pending work and discard late replies', async () => {
  await visit()
  const result = await run(async (w, wait) => {
    const d = w.document
    const send = async () => {
      const input = d.querySelector('textarea')
      Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'My next class?')
      input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait()
      d.querySelector('[aria-label="Send message"]').click(); await wait()
    }
    d.querySelector('[aria-label="Open DojoGPT"]').click(); await wait()
    w.chatFixture.mode = 'pending'
    await send()
    d.querySelector('[aria-label="Stop reply"]').click(); await wait()
    w.chatFixture.release(); await wait()
    const stopped = d.querySelector('[role="alert"]')?.textContent
    const noReply = !d.querySelector('[data-chat-markdown]')
    await send()
    d.querySelector('[aria-label="New conversation"]').click(); await wait()
    w.chatFixture.release(); await wait()
    const cleared = d.querySelectorAll('[data-chat-message]:not([data-chat-greeting])').length === 0 && !!d.querySelector('[data-chat-greeting]') && !d.querySelector('[role="alert"]')
    await send()
    d.querySelector('[aria-label="Expand chat"]').click(); await wait(200)
    w.switchInstructorFixture(); await wait()
    w.chatFixture.release(); await wait()
    const switched = !!d.querySelector('[aria-label="Open DojoGPT"]') && d.querySelectorAll('[data-chat-message]:not([data-chat-greeting])').length === 0 && !!d.querySelector('[data-chat-greeting]')
    return { stopped, noReply, cleared, switched, aborted: w.chatFixture.aborted }
  })
  assert.match(result.stopped, /stopped/)
  assert.equal(result.noReply, true)
  assert.equal(result.cleared, true)
  assert.equal(result.switched, true)
  assert.equal(result.aborted, 3)
})

test('expand and minimize preserve messages, drafts and pending replies with modal focus containment', async () => {
  await visit(1440)
  const expanded = await run(async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Open DojoGPT"]').click(); await wait()
    const panelWidth = d.querySelector('[data-floating-chatbot] [role="dialog"]').getBoundingClientRect().width
    w.chatFixture.mode = 'pending'
    d.querySelector('[aria-label="Suggested questions"] button').click(); await wait()
    const input = d.querySelector('textarea')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'An unfinished follow-up')
    input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait()
    d.querySelector('[aria-label="Expand chat"]').click(); await wait(300)
    const modal = d.querySelector('[data-expanded-chat]')
    const result = { modal: modal?.getAttribute('aria-modal'), width: modal?.getBoundingClientRect().width, panelWidth,
      draft: modal?.querySelector('textarea').value, focused: d.activeElement === modal?.querySelector('textarea'),
      logCount: d.querySelectorAll('[aria-label="Chat messages"]').length, pending: !!modal?.querySelector('[aria-label="Stop reply"]'),
      calls: w.chatFixture.calls.length, aborted: w.chatFixture.aborted }
    d.querySelector('[aria-label="Minimize chat"]').click(); await wait(200)
    result.minimizedDraft = d.querySelector('textarea').value
    result.minimizedPending = !!d.querySelector('[aria-label="Stop reply"]')
    d.querySelector('[aria-label="Expand chat"]').click(); await wait(200)
    w.chatFixture.release(); await wait(200)
    result.received = d.querySelector('[data-chat-markdown]')?.textContent
    d.querySelector('[aria-label="Close chat"]').focus()
    return result
  })
  assert.equal(expanded.modal, 'true')
  assert.ok(expanded.width > expanded.panelWidth)
  assert.equal(expanded.draft, 'An unfinished follow-up')
  assert.equal(expanded.minimizedDraft, expanded.draft)
  assert.equal(expanded.focused, true)
  assert.equal(expanded.logCount, 1)
  assert.equal(expanded.pending, true)
  assert.equal(expanded.minimizedPending, true)
  assert.equal(expanded.calls, 1)
  assert.equal(expanded.aborted, 0)
  assert.match(expanded.received, /10:00 AM/)

  await request(`/session/${session}/actions`, { actions: [{ type: 'key', id: 'modal-keyboard', actions: Array.from({ length: 16 }, () => [{ type: 'keyDown', value: '\uE004' }, { type: 'keyUp', value: '\uE004' }, { type: 'pause', duration: 25 }]).flat() }] })
  assert.equal(await run(async (w, wait) => { await wait(); return !!w.document.activeElement.closest('[data-expanded-chat]') }), true)
  await request(`/session/${session}/actions`, { actions: [{ type: 'key', id: 'modal-keyboard', actions: [{ type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' }] }] })
  const dismissed = await run(async (w, wait) => {
    await wait(200)
    const d = w.document
    const result = { expanded: !!d.querySelector('[data-expanded-chat]'), open: !!d.querySelector('[aria-label="Close DojoGPT"]'),
      focusReturned: d.activeElement === d.querySelector('[aria-label="Expand chat"]'), draft: d.querySelector('textarea').value }
    d.querySelector('[aria-label="Expand chat"]').click(); await wait(200)
    d.querySelector('[aria-label="Close chat"]').click(); await wait(200)
    result.closed = !d.querySelector('[data-expanded-chat]') && !!d.querySelector('[aria-label="Open DojoGPT"]')
    result.launcherFocus = d.activeElement === d.querySelector('[aria-label="Open DojoGPT"]')
    d.querySelector('[aria-label="Open DojoGPT"]').click(); await wait()
    result.retained = !!d.querySelector('[data-chat-markdown]')
    return result
  })
  assert.equal(dismissed.expanded, false)
  assert.equal(dismissed.open, true)
  assert.equal(dismissed.focusReturned, true)
  assert.equal(dismissed.draft, expanded.draft)
  assert.equal(dismissed.closed, true)
  assert.equal(dismissed.launcherFocus, true)
  assert.equal(dismissed.retained, true)

  await run(async (w, wait) => { w.document.querySelector('[aria-label="Expand chat"]').click(); await wait(200); return true })
  await request(`/session/${session}/actions`, { actions: [{ type: 'pointer', id: 'outside-modal', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', duration: 0, x: 4, y: 4 }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
  ] }] })
  assert.equal(await run(async (w, wait) => { await wait(200); return !w.document.querySelector('[data-expanded-chat]') && !!w.document.querySelector('[aria-label="Close DojoGPT"]') }), true)
})

test('assistant Markdown is safe, tables scroll, and expanded chat fits mobile and desktop', async () => {
  await visit(1440)
  const sample = '**Today’s schedule · Sunday, 8 November**\n\n**11:00 am–12:00 pm**\nChildren Juniors — Sunday\nCentral Dojo · Class\n\n- One class\n- No other events\n\n| Time | Event | Type | Centre |\n| --- | --- | --- | --- |\n| 11:00–12:00 | Children Juniors — Sunday | Class | Central Dojo |\n\n<img src="https://attacker.test/pixel" onerror="window.chatUnsafe=true">\n\n<script>window.chatUnsafe=true</script>\n\n![tracking](https://attacker.test/pixel)\n\n[Unsafe](javascript:alert(1)) [External](https://attacker.test)\n\nSource: get_my_schedule (from\u202f2026-11-08\u202fto\u202f2026-11-09, 1 record returned, no further pages).'
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
    const result = await request(`/session/${session}/execute/async`, { args: [], script: `
      const done = arguments[arguments.length - 1];
      (async () => {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;top:0;left:0;width:${width}px;height:${height}px;border:0';
        document.body.append(frame);
        try {
          await new Promise(resolve => { frame.onload = () => setTimeout(resolve, 700); frame.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent('/instructor/calendar?fixtureChat=true'); });
          const d = frame.contentDocument, w = frame.contentWindow;
          w.chatFixture.reply = ${JSON.stringify(sample)};
          d.querySelector('[aria-label="Open DojoGPT"]').click();
          await new Promise(resolve => setTimeout(resolve, 150));
          const input = d.querySelector('textarea');
          Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, '**Literal question**');
          input.dispatchEvent(new w.Event('input', { bubbles: true }));
          await new Promise(resolve => setTimeout(resolve, 100));
          d.querySelector('[aria-label="Send message"]').click();
          await new Promise(resolve => setTimeout(resolve, 250));
          const markdown = d.querySelector('[data-chat-markdown]');
          const region = markdown.querySelector('[role="region"]');
          const panel = d.querySelector('[data-floating-chatbot] [role="dialog"]');
          const output = { strong: markdown.querySelectorAll('strong').length, lists: markdown.querySelectorAll('ul li').length,
            unsafe: !!markdown.querySelector('img, script, iframe, a') || !!w.chatUnsafe,
            userLiteral: d.querySelector('[aria-label="Chat messages"]').textContent.includes('**Literal question**'),
            sourcesVisible: !!d.querySelector('[aria-label="Source records"]'), scrollable: region.scrollWidth > region.clientWidth,
            sourceTextVisible: /Source:|get_my_schedule|record returned/.test(markdown.textContent),
            tableFocusable: region.tabIndex === 0, panelFits: panel.scrollWidth <= panel.clientWidth + 1 };
          d.querySelector('[aria-label="Expand chat"]').click();
          await new Promise(resolve => setTimeout(resolve, 250));
          const modal = d.querySelector('[data-expanded-chat]'), bounds = modal.getBoundingClientRect();
          output.modalFits = bounds.left >= 0 && bounds.top >= 0 && bounds.right <= ${width} && bounds.bottom <= ${height} && modal.scrollWidth <= modal.clientWidth + 1;
          output.oneLog = d.querySelectorAll('[aria-label="Chat messages"]').length === 1;
          output.formBottom = modal.querySelector('form').getBoundingClientRect().bottom;
          output.modalBottom = bounds.bottom;
          output.formVisible = output.formBottom <= bounds.bottom + 1;
          done(output);
        } catch (error) { done({ error: String(error) }); } finally { frame.remove(); }
      })();` })
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.strong, 2)
    assert.equal(result.lists, 2)
    assert.equal(result.unsafe, false)
    assert.equal(result.userLiteral, true)
    assert.equal(result.sourcesVisible, false)
    assert.equal(result.sourceTextVisible, false)
    if (width < 640) assert.equal(result.scrollable, true)
    assert.equal(result.tableFocusable, true)
    assert.equal(result.panelFits, true, `${width}x${height}`)
    assert.equal(result.modalFits, true, `${width}x${height}`)
    assert.equal(result.oneLog, true)
    assert.equal(result.formVisible, true, JSON.stringify({ width, height, ...result }))
  }
})

test('chat fits narrow and desktop viewports with readable input and reachable actions', async () => {
  await visit()
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
    const result = await request(`/session/${session}/execute/async`, { args: [], script: `
      const done = arguments[arguments.length - 1];
      (async () => {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;top:0;left:0;width:${width}px;height:${height}px;border:0';
        document.body.append(frame);
        try {
          await new Promise(resolve => { frame.onload = () => setTimeout(resolve, 600); frame.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent('/instructor/calendar?fixtureChat=true'); });
          const d = frame.contentDocument, w = frame.contentWindow;
          d.querySelector('[aria-label="Open DojoGPT"]').click();
          await new Promise(resolve => setTimeout(resolve, 300));
          const panel = d.querySelector('[data-floating-chatbot] [role="dialog"]');
          const bounds = panel.getBoundingClientRect();
          const send = d.querySelector('[aria-label="Send message"]').getBoundingClientRect();
          const topics = [...d.querySelectorAll('[aria-label="Suggested questions"] button')];
          const topicBounds = topics.map(button => button.getBoundingClientRect());
          const viewport = panel.querySelector('[data-slot="scroll-area-viewport"]');
          viewport.scrollTop = viewport.scrollHeight;
          const lastTopic = topics.at(-1).getBoundingClientRect(), scrollBounds = viewport.getBoundingClientRect();
          done({ fits: bounds.left >= 0 && bounds.right <= ${width} && bounds.top >= 0 && bounds.bottom <= ${height},
            inputSize: parseFloat(w.getComputedStyle(d.querySelector('textarea')).fontSize),
            sendReachable: send.top >= bounds.top && send.bottom <= bounds.bottom,
            noOverflow: panel.scrollWidth <= panel.clientWidth,
            topicCount: topics.length, topicsFit: topicBounds.every(rect => rect.height >= 44 && rect.left >= bounds.left && rect.right <= bounds.right),
            lastTopicReachable: lastTopic.bottom <= scrollBounds.bottom + 1 && lastTopic.top >= scrollBounds.top - 1 });
        } catch (error) { done({ error: String(error) }); } finally { frame.remove(); }
      })();` })
    assert.equal(result.error, undefined, result.error)
    assert.equal(result.fits, true, `${width}x${height}`)
    assert.equal(result.sendReachable, true, `${width}x${height}`)
    assert.equal(result.noOverflow, true, `${width}x${height}`)
    assert.equal(result.topicCount, 4)
    assert.equal(result.topicsFit, true, `${width}x${height}`)
    assert.equal(result.lastTopicReachable, true, `${width}x${height}`)
    if (width < 640) assert.ok(result.inputSize >= 16)
  }
  await visit(1440)
  await run(async (w, wait) => { w.document.querySelector('[aria-label="Open DojoGPT"]').click(); await wait(300); return true })
  const screenshot = await request(`/session/${session}/screenshot`, undefined, 'GET')
  await mkdir('/tmp/opencode/chatbot-review', { recursive: true })
  await writeFile('/tmp/opencode/chatbot-review/desktop.png', Buffer.from(screenshot, 'base64'))
})
