FSDP Project for Y2S2

## Getting started

Use Node.js 22.12+ or 24+ and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

The React app runs locally with Vite and connects to **Supabase Cloud**. Set
`VITE_SUPABASE_URL` to `https://YOUR_PROJECT_REF.supabase.co` and
`VITE_SUPABASE_PUBLISHABLE_KEY` to that cloud project's publishable key in `.env`.
Find both in the Supabase Dashboard. Restart the dev server after changing
environment variables. Only use the frontend-safe publishable key; never put a
secret or service-role key in a `VITE_` variable.

The root `.env` is the single source of truth for local configuration, including
the server-only Stripe variables described below. Do not create another `.env`
inside `supabase/`.

Vite reads the root `.env` automatically; `vite.config.ts` explicitly keeps its
environment directory at the project root and exposes only `VITE_` variables to
browser code through `import.meta.env`. Edge Functions run in Supabase Cloud and
read Supabase secrets through `Deno.env.get()`. They cannot read your local file:
sync server-only values to the cloud project as described below. The Supabase
client's `functions.invoke()` calls automatically target that project's hosted
Edge Functions.

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

Set these server-only variables in the same root `.env` created during setup:

| Variable                | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe test secret key starting with `sk_test_`. Live keys are rejected.                             |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_...` signing secret for the Stripe webhook destination pointing to your cloud function.   |
| `STRIPE_PRICE_ID`       | A one-time `price_...` from the same Stripe test account. Quantity is fixed at one.                  |
| `APP_URL`               | Exact frontend origin, such as `http://localhost:5173`, without a path. Used for CORS and redirects. |

### Supabase Cloud configuration

Hosted Edge Functions cannot read your local root `.env`. Configure the
server-only values above in **Edge Functions → Secrets** in the Supabase
Dashboard. Use `http://localhost:5173` for `APP_URL` while developing the frontend
locally, and change it to the hosted frontend origin when publishing the app.
Use the cloud Stripe webhook destination's signing secret. The existing
`Deno.env.get()` calls read Supabase's runtime secrets without code changes.

Alternatively, when the root `.env` contains the intended target project's
values, sync it with the npm-provided CLI:

```sh
npx supabase@latest login
npx supabase@latest secrets set --env-file .env --project-ref YOUR_PROJECT_REF
```

This command also imports the public `VITE_` entries into the server environment;
it does not expose server secrets to the browser. The Dashboard can be used to
set only the server values. After changing server values in `.env`, sync them
again so the cloud functions use the updated configuration.

The two functions must be deployed to the same Supabase Cloud project before
Checkout can run. When ready to deploy, run:

```sh
npx supabase@latest functions deploy create-checkout-session --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF --use-api
```

Create a Stripe **test-mode** event destination pointing to
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`, listening for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.
Copy its signing secret into the root `.env` and sync the cloud secrets. Stripe
delivers events directly to the cloud function.

### Production frontend

For the production frontend build, configure only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in the hosting provider's build environment before
running `npm run build`. These public values are embedded at build time; Stripe
secrets belong only in Supabase's function environment.

The root `.env` and nested environment files are ignored by Git; only the root
`.env.example` is committed. Never put Stripe secrets or Supabase privileged keys
in a `VITE_` variable. The integration does not need a Supabase service-role key;
Supabase supplies its built-in server credentials to Edge Functions automatically.

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

### Testing against Supabase Cloud

Once cloud secrets and functions are configured, run `npm run dev`. Keep the
cloud project URL and publishable key in the root `.env`, with `APP_URL` matching
the browser origin exactly, including the port. The cloud function's `APP_URL`
secret must match too. Vite is the only local application server needed.

When a future UI action needs checkout, call the reusable helper:

```ts
import { startCheckout } from "./lib/stripe";

const attemptKey = crypto.randomUUID();
await startCheckout(attemptKey);
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

The setup commands above are instructions; no functions have been deployed by
this setup.
