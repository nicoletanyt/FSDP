// Run from the project root. Deno loads the root .env on the server only.
import { handleRequest as checkout } from '../supabase/functions/create-grading-checkout/handler.ts'
import { handleRequest as webhook } from '../supabase/functions/stripe-webhook/handler.ts'
import { getStripe, requireEnv } from '../supabase/functions/_shared/stripe.ts'

// Use the same Cloud database as the frontend, without exposing service keys.
Deno.env.set('SUPABASE_URL', requireEnv('VITE_SUPABASE_URL'))
Deno.env.set('SUPABASE_ANON_KEY', requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'))
requireEnv('SUPABASE_SERVICE_ROLE_KEY')
getStripe() // Fail before listening if the secret is missing or not sk_test_.

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5180', 'http://127.0.0.1:5180']
if (!Deno.env.get('APP_URL')) Deno.env.set('APP_URL', localOrigins[0])
Deno.env.set('AUTH_ALLOWED_ORIGINS', [Deno.env.get('AUTH_ALLOWED_ORIGINS'), ...localOrigins].filter(Boolean).join(','))

Deno.serve({ hostname: '127.0.0.1', port: 8787 }, request => {
  const path = new URL(request.url).pathname
  if (path === '/functions/v1/create-grading-checkout') return checkout(request)
  if (path === '/functions/v1/stripe-webhook') return webhook(request)
  return new Response('Not found.', { status: 404 })
})
