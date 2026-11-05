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
| `npm run test:functions` | Run Stripe and instructor-provisioning tests |
| `npm run test:auth-db` | Run offline PostgreSQL role/RLS tests |
| `npm run test:auth-seed` | Test the administrator seed without cloud access |
| `npm run seed:admin` | Create the development administrator using root `.env` |
| `npm run seed:instructor-calendar -- --instructor-email EMAIL` | Add marked calendar test classes and event rosters for an existing instructor, in the current Singapore week |
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
- After the instructor-availability migration is applied, trusted instructor
  profile creation also inserts a linked `public.instructors` row (`user_id`
  references the account). Existing unlinked instructors can open their calendar;
  their first successful availability save creates the missing linked row.
- Sessions persist automatically. Roles come from `public.users`; browser clients
  cannot write profiles or assign privileged roles. Passwords stay in Supabase Auth.

## Instructor calendar test records

To populate an existing instructor's calendar with marked test classes for the
current Monday–Sunday week in Singapore time:

```sh
npm run seed:instructor-calendar -- --instructor-email INSTRUCTOR_EMAIL --dry-run
npm run seed:instructor-calendar -- --instructor-email INSTRUCTOR_EMAIL
```

The script uses the root `.env` Supabase URL and server-only service-role key.
It reuses existing active centres, class types and students, and inserts only
`[Calendar Test]` events, matching `classes` rows and `event_students` rosters.
Past sessions cover present/late/absent/excused/unmarked attendance; future
attendance is unmarked, and Sunday has an empty roster. Times avoid the
instructor's existing timed events and availability.

Use `--week-of YYYY-MM-DD` to select a particular week. Repeating the seed for
the same instructor/week uses the same UUIDs, preserves existing fixture rows
and recorded attendance/notes, and fills missing subtype/roster batches. To remove
only that instructor/week's marked fixtures (with cascading class/roster cleanup):

```sh
npm run seed:instructor-calendar -- --instructor-email INSTRUCTOR_EMAIL --week-of YYYY-MM-DD --remove
```

This is a development data script rather than a schema migration. It does not
create students, centres, instructors, grading events or application records.

## Administrator console

Administrators sign in at `/staff/login` and land on `/admin`. The console uses a
top navigation bar with **Monitor** and **Grading** menus, an **Instructors**
link, and theme, notification, and profile controls. The logo returns to
`/admin`; students and instructors keep the public home page. Sign out is on
`/admin/profile` rather than in the shared header.

| Route | Purpose |
| --- | --- |
| `/admin` | Overview of attendance, declining students, and the grading pipeline |
| `/admin/centres` | Centre directory: search and filter students; open a full student profile |
| `/admin/calendar` | View sessions, create sessions (including external sessions), and mark rosters present, late, absent, or excused |
| `/admin/calendar/records` | Review and export attendance history |
| `/admin/calendar/monitoring` | Flag declining attendance, notify students, and track follow-up |
| `/admin/grading/eligibility` | Automatic eligibility checks and invitations |
| `/admin/grading/opportunities` | Create grading opportunities and assign an assessing instructor |
| `/admin/grading/applications` | Read-only view and CSV export of submitted applications |
| `/admin/notifications` | Review EmailJS grading invitation requests |
| `/admin/reports` | Consolidated centre reporting and CSV export |
| `/admin/instructors` | Teaching team and instructor account creation |
| `/admin/profile` | Administrator account details and sign out |

The console uses deterministic mock data from `src/lib/admin/mock-data.ts`
through an in-memory provider. Attendance, sessions, opportunities, and
follow-up changes reset on reload. Instructor account creation uses the
`create-instructor` Edge Function. Grading invitation preview and confirmation
use persisted eligibility and the `send-grading-invitation` Edge Function;
the Notifications page shows EmailJS request status (accepted/failed, not
individual delivery). Mock student emails in the browser do not replace the
unique addresses in `public.students`.

Grading results, belt promotions, and application approvals are intentionally
out of scope. Applications are displayed read-only for administrators.

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
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
`STRIPE_GRADING_FEE_ID`, `APP_URL`, `AUTH_ALLOWED_ORIGINS`,
`EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, and `EMAILJS_PUBLIC_KEY` in
**Edge Functions → Secrets**, using the root `.env` as the source. If EmailJS
private-key authorization is enabled, also set `EMAILJS_PRIVATE_KEY`. Supabase
supplies the function's built-in `SUPABASE_*` credentials.

```sh
npx supabase@latest login
npx supabase@latest functions deploy create-checkout-session --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy send-grading-invitation --project-ref YOUR_PROJECT_REF --use-api
npx supabase@latest functions deploy create-grading-checkout --project-ref YOUR_PROJECT_REF --use-api
```

Set `APP_URL` to the frontend origin for Checkout redirects and CORS. Configure
Stripe's test-mode webhook destination as
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` for
`checkout.session.completed` and `checkout.session.async_payment_succeeded`.
Store its signing secret as `STRIPE_WEBHOOK_SECRET` in Supabase.

Configure the EmailJS template's To field as `{{to_email}}`, BCC as
`{{bcc_emails}}`, and its application link as `{{application_url}}`. The server
sets To to `suroulomg@gmail.com`, BCC to eligible students' usable addresses
plus `mq07110@gmail.com` once, and the link to the existing `/grading` route.
Only a signed-in administrator can preview and confirm the single request;
deploying does not send an invitation. An accepted request does not establish
delivery to any recipient. `STRIPE_GRADING_FEE_ID` must be an active test-mode
one-time price of SGD 60.00; only the verified Stripe webhook submits grading
applications. The guest Checkout price remains separate.
