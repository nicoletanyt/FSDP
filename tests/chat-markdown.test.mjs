import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

// Compile this standalone JSX component in memory, without Vite, browser env or
// another auth client. Resolve its bare imports for a data-URL module.
const source = await readFile(new URL('../src/components/instructor/ChatMarkdown.tsx', import.meta.url), 'utf8')
let compiled = (await transformWithOxc(source, 'ChatMarkdown.tsx', { jsx: { runtime: 'automatic' } })).code
for (const name of ['react/jsx-runtime', 'react', 'react-markdown', 'remark-gfm']) compiled = compiled.replaceAll(`"${name}"`, JSON.stringify(import.meta.resolve(name))).replaceAll(`'${name}'`, JSON.stringify(import.meta.resolve(name)))
compiled = compiled.replaceAll("'../../../supabase/functions/_shared/chat-output'", JSON.stringify(new URL('../supabase/functions/_shared/chat-output.ts', import.meta.url).href)).replaceAll('"../../../supabase/functions/_shared/chat-output"', JSON.stringify(new URL('../supabase/functions/_shared/chat-output.ts', import.meta.url).href))
const { default: ChatMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const render = content => renderToStaticMarkup(createElement(ChatMarkdown, { content }))

test('assistant markdown formats paragraphs, emphasis, lists and readable line breaks', () => {
  const html = render('**Today’s schedule · Sunday, 8 November**\n\n**11:00 am–12:00 pm**\nChildren Juniors — Sunday\nCentral Dojo · Class\n\n- One class\n- No other events\n\n*Singapore time*')
  assert.match(html, /<strong[^>]*>11:00 am–12:00 pm<\/strong>/)
  assert.match(html, /whitespace-pre-line/)
  assert.match(html, /<ul[^>]*>/)
  assert.equal((html.match(/<li /g) ?? []).length, 2)
  assert.match(html, /<em>Singapore time<\/em>/)
  assert.ok(!html.includes('**'))
})

test('GFM tables render in a labelled keyboard-scrollable region', () => {
  const html = render('| Time | Event | Centre |\n| --- | --- | --- |\n| 11:00–12:00 | Children Juniors | Central Dojo |')
  assert.match(html, /role="region" aria-label="Table in assistant reply" tabindex="0"/)
  assert.match(html, /overflow-x-auto/)
  assert.match(html, /<table /)
  assert.equal((html.match(/<th /g) ?? []).length, 3)
  assert.match(html, /scope="col"/)
  assert.ok(!html.includes('| --- |'))
})

test('untrusted HTML, images and model-generated links cannot become active content', () => {
  const html = render('<script>alert(1)</script>\n\n<img src="https://attacker.test/pixel" onerror="alert(1)">\n\n<iframe src="https://attacker.test"></iframe>\n\n![tracking](https://attacker.test/pixel)\n\n[Unsafe](javascript:alert(1)) and [External](https://attacker.test) and [Internal](/instructor/students)\n\nhttps://attacker.test')
  assert.doesNotMatch(html, /<(script|img|iframe|a|input)\b|\bonerror=|\bhref=|\bsrc=/i)
  assert.match(html, /Unsafe/)
  assert.match(html, /External/)
  assert.match(html, /Internal/)
})

test('code stays escaped and headings do not overwhelm the chat panel', () => {
  const html = render('# Schedule\n\n`<img src=x onerror=alert(1)>`\n\n```html\n<script>alert(1)</script>\n```')
  assert.doesNotMatch(html, /<h[1-6]\b|<script\b|<img\b/)
  assert.match(html, /&lt;script&gt;/)
  assert.match(html, /<pre /)
  assert.match(html, /font-semibold">Schedule/)
})

test('source text from an older deployed function is removed before rendering', () => {
  const html = render('**11:00 am–12:00 pm**\nChildren Juniors — Sunday\n\n*Source: get_my_schedule (from\u202f2026-11-08\u202fto\u202f2026-11-09, 1 record returned, no further pages).*')
  assert.match(html, /Children Juniors/)
  assert.doesNotMatch(html, /Source:|get_my_schedule|record returned|further pages/)
})
