# FSDP

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router
- **Backend:** Supabase Cloud — PostgreSQL, Auth, and Deno Edge Functions
- **Payments:** Stripe hosted Checkout (test mode)
- **Hosting:** Vercel (frontend)
- **Package manager:** npm

## Brand & theme

The Aikido Shinju-Kai palette lives in `src/index.css`:

| Token | Hex | Usage |
| --- | --- | --- |
| `--brand-blue` | `#2c3f67` | Primary actions, links, focus rings |
| `--brand-red` | `#e62128` | Accents, destructive actions |
| `--brand-grey` | `#352b29` | Body text and warm neutrals |

Semantic shadcn tokens (`--primary`, `--destructive`, `--foreground`, ...) map
onto these colours, with a warm-grey dark theme. Prefer semantic utilities such
as `bg-primary` and `text-muted-foreground` in components; use `bg-brand-*`
only where the exact brand colour is required. For red text use
`text-brand-red-ink`, which switches to a lighter red in dark mode to keep
contrast accessible.

Dark mode follows the system preference, can be toggled from the header, and is
persisted in `localStorage`. The emblem is served from `public/logo.png` and is
used in the header and as the favicon.

## Setup

Requires Node.js 22.12+ or 24+. Edge Function checks and tests also require Deno.

```sh
npm install
cp .env.example .env
npm run dev
```

Fill in the root `.env` using `.env.example`. Use your Supabase Cloud project
credentials. Only `VITE_` variables are exposed to the browser; never prefix
server secrets with `VITE_`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the frontend locally |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run check:functions` | Type-check Edge Functions |
| `npm run test:functions` | Run Stripe function tests |
| `npx shadcn@latest add <component>` | Add a shadcn/ui component |

## Deployment

### Frontend — Vercel

For initial setup, log in, link the project, and add the public variables:

```sh
npx vercel@latest login
npx vercel@latest link
npx vercel@latest env add VITE_SUPABASE_URL --environment production
npx vercel@latest env add VITE_SUPABASE_PUBLISHABLE_KEY --environment production
npx vercel@latest env add VITE_STRIPE_PUBLISHABLE_KEY --environment production
```

Build and deploy:

```sh
npm run build
npx vercel@latest deploy --prod
```

### Edge Functions — Supabase Cloud

Replace `YOUR_PROJECT_REF` with your Supabase project reference. Ensure the root
`.env` contains the intended deployment values before syncing secrets:

```sh
npx supabase@latest login
npx supabase@latest secrets set --env-file .env --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy create-checkout-session --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF --use-api
```

Set `APP_URL` to the frontend origin for Checkout redirects and CORS. Configure
Stripe's test-mode webhook destination as
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.
Store its signing secret as `STRIPE_WEBHOOK_SECRET` in Supabase.
