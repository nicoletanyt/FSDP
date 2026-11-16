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
    ['saved', '?paidApplication=1&appRoute=%2Fgrading'],
    ['returned', '?appRoute=' + encodeURIComponent('/grading?checkout=success&session_id=cs_test_fixture')],
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
      assert.match(text, /Payment confirmed/)
      assert.match(text, /5th Kyu/)
      assert.match(text, /[Aa]waiting dojo review/)
      assert.match(text, /Amount paid.*77\.00/s)
      assert.match(result.stdout, /<button\b[^>]*disabled[^>]*>Payment confirmed<\/button>/)
      assert.doesNotMatch(text, /Application draft saved:|not submitted|Payment preview completed/)
      if (name === 'returned') assert.match(text, /Payment confirmed\. Your grading application/)
    } finally {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
  }
})
