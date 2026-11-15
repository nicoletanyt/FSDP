import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('grade badges show a colour swatch alongside the rank and retain an accessible colour', async () => {
  const server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const { DatabaseGradeBadge } = await server.ssrLoadModule('/src/components/shared/grade/GradeBadge.tsx')
    const { default: GradeBadge } = await server.ssrLoadModule('/src/components/shared/grade/GradeBadge.tsx')
    const grade = { id: 'blue-6th-kyu', label: 'Blue (6th Kyu)', colour: 'Blue', is_ranked: true, sort_order: 7 }
    const database = renderToStaticMarkup(React.createElement(DatabaseGradeBadge, { grade }))
    assert.match(database, /6th Kyu/)
    assert.match(database, /order-first size-3.*bg-blue-600/)
    assert.match(database, /class="sr-only"> · Blue/)
    const dan = renderToStaticMarkup(React.createElement(DatabaseGradeBadge, { grade: { ...grade, label: '1st Dan', colour: 'Black' } }))
    assert.match(dan, /1st Dan/)
    assert.match(dan, /bg-slate-950/)
    const missing = renderToStaticMarkup(React.createElement(DatabaseGradeBadge, { grade: null }))
    assert.match(missing, /Grade not recorded/)
    assert.doesNotMatch(missing, /order-first/)
    const staticBadge = renderToStaticMarkup(React.createElement(GradeBadge, { rank: '6-kyu', system: 'adults' }))
    assert.match(staticBadge, /order-first size-3.*bg-blue-600/)
    assert.match(staticBadge, /6th Kyu/)
    const { default: TitleBadge } = await server.ssrLoadModule('/src/components/instructor/TitleBadge.tsx')
    for (const [title, label] of [['shihan', 'Shihan'], ['shidoin', 'Shidōin'], ['fukushidoin', 'Fuku-shidōin']]) {
      const badge = renderToStaticMarkup(React.createElement(TitleBadge, { title }))
      assert.match(badge, new RegExp(`data-slot="title-badge" data-title="${title}"`))
      assert.match(badge, new RegExp(`>${label}</span>`))
      assert.match(badge, /rounded-md border bg-background/)
    }
  } finally {
    await server.close()
  }
})
