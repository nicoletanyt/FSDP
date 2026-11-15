import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5180'
const temp = join(process.env.LOCALAPPDATA, 'Temp', 'opencode')

test('recorded Stripe payments render as confirmed, retain the paid amount and cannot be paid again', async () => {
  for (const [name, query] of [
    ['saved', '?empty=1&savedDraft=1&appRoute=%2Fgrading'],
    ['returned', '?empty=1&appRoute=' + encodeURIComponent('/grading?checkout=test-success&session_id=cs_test_preview')],
  ]) {
    const profile = await mkdtemp(join(temp, 'grading-receipt-'))
    try {
      const result = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
        `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--timeout=15000', '--window-size=1440,1000',
        `--screenshot=${join(temp, `grading-receipt-${name}.png`)}`, '--dump-dom',
        `${origin}/tests/mobile-responsive/grading-payment.html${query}`],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
      assert.equal(result.status, 0, result.error?.message ?? result.stderr.slice(-1000))
      const text = result.stdout.replace(/<[^>]+>/g, '')
      assert.match(text, /Payment confirmed: Blue-Gold \(5th Kyu\)/)
      assert.match(text, /awaiting dojo eligibility review/)
      assert.match(text, /Amount Paid.*55\.00/s)
      assert.match(result.stdout, /<button\b[^>]*disabled[^>]*>Payment Confirmed<\/button>/)
      assert.doesNotMatch(text, /Application draft saved:|not submitted|Payment preview completed/)
      if (name === 'returned') assert.match(text, /Payment confirmed and recorded/)
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})
