FSDP Project for Y2S2

## Getting started

Use Node.js 22.12+ or 24+ and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` using your
Supabase project's URL and publishable key. Restart the dev server after changing
environment variables. Only use the frontend-safe publishable key; never put a
secret or service-role key in a `VITE_` variable.

The starter pages run without Supabase credentials. Configure `.env` before
importing the client from `src/lib/supabase.ts` into a feature.

## Commands

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check and build for production.
- `npm run preview` — preview the production build locally.
- `npm run check:functions` — type-check Edge Functions (requires Deno).
- `npm run test:functions` — test Checkout and webhook handling with signed
  fixtures and mocked Stripe requests (requires Deno; no credentials or network
  access needed).

## Structure

```text
src/
  components/  Reusable UI components
  pages/       Home, Checkout redirects, and Not Found route pages
  layouts/     Shared root layout with an Outlet
  lib/         Utilities, Supabase client, and Checkout helper
  hooks/       Custom React hooks
  App.tsx      Client-side routing
  main.tsx     React entry point
  index.css    Tailwind CSS v4 entry point
```

Routes `/`, `/checkout/success`, `/checkout/cancel`, and `*` share the root layout.
Production hosting must serve
`index.html` for application routes so direct navigation works with React Router.

## Stripe Checkout (test mode)

Stripe's SDK is used only by Supabase Edge Functions. Hosted Checkout needs no
Stripe.js, payment form, or frontend Stripe publishable key.

### Server configuration

Copy the server environment example separately from the frontend `.env`:

```sh
cp supabase/functions/.env.example supabase/functions/.env
```

Set these server-only variables:

| Variable | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Stripe test secret key starting with `sk_test_`. Live keys are rejected. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_...` signing secret for this specific webhook endpoint or Stripe CLI listener. |
| `STRIPE_PRICE_ID` | A one-time `price_...` from the same Stripe test account. Quantity is fixed at one. |
| `APP_URL` | Exact frontend origin, such as `http://localhost:5173`, without a path. Used for CORS and redirects. |

For a hosted Supabase project, configure these values in **Edge Functions →
Secrets** in the Supabase Dashboard. Alternatively, when ready to configure a
project, use the npm-provided CLI:

```sh
npx supabase@latest secrets set --env-file supabase/functions/.env --project-ref YOUR_PROJECT_REF
```

Both `.env` files are ignored by Git. Stripe secrets must never be placed in a
`VITE_` variable. The integration does not need a Supabase service-role key.

### Edge Functions

- `create-checkout-session` creates a hosted, one-time payment Checkout Session.
  The server controls price, quantity, mode, and redirects; client-supplied
  amounts, prices, and redirect URLs are not used. It requires a UUID
  `Idempotency-Key` header so retrying one attempt can reuse the same session.
- `stripe-webhook` verifies `Stripe-Signature` against the **raw request body**
  using Stripe's asynchronous Web Crypto verification. It rejects live-mode
  events and listens for `checkout.session.completed` and
  `checkout.session.async_payment_succeeded`.
- For paid, one-time sessions, the webhook sets the fixed Stripe session
  metadata marker `checkout_payment_verified=true`. A stable per-session Stripe
  idempotency key covers duplicate and concurrent deliveries across both event
  types. Repeating the same metadata assignment stays idempotent even after
  Stripe's idempotency-key retention window. Failed updates return `500` so
  Stripe can retry; unpaid sessions and unrelated events are acknowledged without
  changes. No fulfillment or database writes are performed.

`supabase/config.toml` disables platform JWT verification for both functions.
Checkout is intentionally available to guests; CORS is not authentication.
The webhook authenticates Stripe using its signature instead of a Supabase JWT.

### Local testing

With Docker, the Stripe CLI, and Deno installed, use separate terminals:

```sh
npx supabase@latest start
npx supabase@latest functions serve --env-file supabase/functions/.env
```

```sh
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Set `STRIPE_WEBHOOK_SECRET` to the signing secret printed by `stripe listen` and
restart the function server. Configure the frontend `.env` with the local
Supabase URL and publishable key shown by the CLI, then run `npm run dev`.
`APP_URL` must match the browser origin exactly, including the port.

When a future UI action needs checkout, call the reusable helper:

```ts
import { startCheckout } from './lib/stripe'

const attemptKey = crypto.randomUUID()
await startCheckout(attemptKey)
// Reuse attemptKey if this attempt needs a network retry.
```

Handle errors in the calling UI. Use a new key for a new purchase attempt.
Complete a real test Checkout with Stripe's `4242 4242 4242 4242` test card, any
future expiry, and any three-digit CVC. This creates an actual test Session for
the webhook's metadata update; generated fixture events can refer to sessions
that cannot be updated.

Checkout redirects to `/checkout/success?session_id=...` or `/checkout/cancel`.
The success route is informational: visiting it or supplying a session ID is
never proof of payment. Any future fulfillment must use verified server-side
payment state and its own durable, atomic idempotency mechanism.

For future hosted testing, the webhook URL is
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`. Configure a
Stripe **test-mode** event destination with the two event types above and use
that destination's signing secret. No functions have been deployed.
