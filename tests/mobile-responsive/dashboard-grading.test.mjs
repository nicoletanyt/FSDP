import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5180'
const temp = join(process.env.LOCALAPPDATA, 'Temp', 'opencode')

test('dashboard grading tile renders live-shaped draft, preview, submission, empty and failure states', async () => {
  for (const [scenario, width, expected] of [
    ['draft', 1440, /1 draft saved — not submitted/],
    ['paid', 1440, /1 payment confirmed — awaiting dojo review/],
    ['submitted', 1440, /1 submitted/],
    ['empty', 390, /No pending actions/],
    ['error', 390, /Status unavailable — view applications/],
  ]) {
    const profile = await mkdtemp(join(temp, 'dashboard-grading-'))
    try {
      const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
        `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--timeout=15000', `--window-size=${width},1700`,
        `--screenshot=${join(temp, `dashboard-grading-${scenario}-${width}.png`)}`, '--dump-dom',
        `${origin}/tests/mobile-responsive/dashboard-grading.html?scenario=${scenario}`],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
      assert.equal(result.status, 0, result.error?.message ?? result.stderr.slice(-1000))
      const anchors = result.stdout.match(/<a\b[^>]*href="\/grading"[^>]*>[\s\S]*?<\/a>/g) ?? []
      const tile = anchors.find((anchor) => anchor.includes('Grading Applications'))
      assert.ok(tile, `Grading tile missing for ${scenario}`)
      assert.match(tile.replace(/<[^>]+>/g, ''), expected)
      if (scenario !== 'empty') assert.doesNotMatch(tile, /No pending actions/)
      if (['draft', 'paid', 'submitted'].includes(scenario)) assert.match(tile, /1 saved or pending grading applications/)
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})
