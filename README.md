# FSDP

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router
- **Backend:** Supabase Cloud — PostgreSQL, Auth, and Deno Edge Functions
- **Payments:** Stripe hosted Checkout (test mode)
- **Hosting:** Vercel (frontend)
- **Package manager:** npm

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
| `npm run test:functions` | Run Stripe and instructor-provisioning tests |
| `npm run test:auth-db` | Run offline PostgreSQL role/RLS tests |
| `npm run test:auth-seed` | Test the administrator seed without cloud access |
| `npm run seed:admin` | Create the development administrator using root `.env` |
| `npx shadcn@latest add <component>` | Add a shadcn/ui component |

## Authentication

- Students: `/signup`, `/login`, and `/dashboard`.
- Student signup signs in immediately and redirects to `/dashboard`, without
  email confirmation.
- New passwords require at least 8 characters, a letter, and a number. Existing accounts
  keep their current passwords. Email/password fields start empty on reload.
- Staff: `/staff/login`; instructor dashboard: `/instructor`; administrator
  dashboard: `/admin`, including instructor account creation.
- Instructor passwords are generated server-side and displayed to the creating
  administrator after success. Save them then; they are not saved to browser storage.
- Sessions persist automatically. Roles come from `public.users`; browser clients
  cannot write profiles or assign privileged roles. Passwords stay in Supabase Auth.

After approving the target cloud database changes, apply the migration:

```sh
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --linked
npx supabase@latest functions deploy create-instructor --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest secrets set AUTH_ALLOWED_ORIGINS=http://localhost:5173 --project-ref YOUR_PROJECT_REF
```

Enable email/password sign-ins and signups in Supabase Auth, and turn off
**Confirm email** in the Email provider settings for immediate signup sessions.
`AUTH_ALLOWED_ORIGINS` adds development origins for instructor creation without
changing Stripe's existing `APP_URL`.

For a development administrator, set `SUPABASE_SERVICE_ROLE_KEY`,
`ADMIN_SEED_EMAIL`, and `ADMIN_SEED_PASSWORD` (8–128 characters, including a letter and number) in the
root `.env`, then run `npm run seed:admin` against the intended development
project. The script confirms the account and assigns the administrator role. It
does not reset passwords or elevate existing non-administrators. Keep seed
credentials local; do not upload them to Vercel or function secrets.

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

Replace `YOUR_PROJECT_REF` with your Supabase project reference. Configure
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `APP_URL`, and
`AUTH_ALLOWED_ORIGINS` in **Edge Functions → Secrets**, using the root `.env` as
the source. Supabase supplies the function's built-in `SUPABASE_*` credentials.

```sh
npx supabase@latest login
npx supabase@latest functions deploy create-checkout-session --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF --use-api
```

Set `APP_URL` to the frontend origin for Checkout redirects and CORS. Configure
Stripe's test-mode webhook destination as
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.
Store its signing secret as `STRIPE_WEBHOOK_SECRET` in Supabase.
