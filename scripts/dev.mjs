import { spawn } from 'node:child_process'
import { loadEnv } from 'vite'
import { setTimeout } from 'node:timers/promises'

const env = loadEnv('development', process.cwd(), '')
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  }
  process.exitCode = code
}
function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code ?? 1) })
  return child
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

// A configured local payment endpoint must be running before exposing the UI.
// Do not redirect failed payment POSTs to another server: that could pay twice.
if (env.VITE_PAYMENT_FUNCTIONS_URL) {
  const local = new URL(env.VITE_PAYMENT_FUNCTIONS_URL)
  if (!['localhost', '127.0.0.1'].includes(local.hostname) || local.port !== '8787') {
    throw new Error('Local payment development server must use localhost:8787.')
  }
  const endpoint = new URL('/functions/v1/create-grading-checkout', local)
  const ready = async () => {
    try {
      const response = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' }, signal: AbortSignal.timeout(1000) })
      return response.status === 204
    } catch { return false }
  }
  if (!await ready()) {
    if (!process.env.npm_execpath) throw new Error('Start development with npm run dev.')
    const payment = run(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package=deno', '--', 'deno', 'run', '--watch', '--no-lock', '--env-file=.env', '--allow-env', '--allow-net', 'scripts/serve-payment-functions.ts'])
    let started = false
    for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
      if (await ready()) { started = true; break }
      await setTimeout(1000)
    }
    if (!started) {
      console.error('Payment server did not start. Check the server-only Supabase and Stripe secrets in .env.')
      stop(1)
    }
    if (payment.exitCode !== null) stop(1)
  }
}
if (!stopping) run(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)])
