# AGENTS.md

## Commands

- `npm run build` — the only frontend gate: `tsc --noEmit` then Vite build. There is no lint or format script, and no CI workflow.
- `npm run dev` — Vite dev server. Config reads `.env` from the repo root (`envDir`).
- Backend checks require Deno:
  - `npm run check:functions` — type-check all three Edge Functions.
  - `npm run test:functions` — run Deno function tests.
  - Single test: `deno test --no-lock --allow-env supabase/functions/tests/stripe.test.ts`
- Offline Node tests (no cloud access):
  - `node --test tests/auth-db.test.mjs`
  - `node --test tests/seed-admin.test.mjs`
- Node 22.12+ or 24+.

## Stack quirks

- React 19, Vite 8, TypeScript 7, Tailwind v4 (CSS-first; no `tailwind.config`).
- Routing uses `react-router` v8. Import from `react-router`, not `react-router-dom`.
- `tsconfig` is strict with `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax`; use `import type` for type-only imports.
- shadcn is configured as `base-nova`: UI primitives import from `@base-ui/react/*`, not Radix. Add components with `npx shadcn@latest add <name>`; keep `components.json` aliases.
- Import `cn` from the `cn` package. `src/lib/utils.ts` only re-exports it, and most UI/app files use `import { cn } from 'cn'`.
- Theme tokens live in `src/index.css` under `@theme inline`. Prefer semantic utilities (`bg-primary`, `text-muted-foreground`, `text-brand-red-ink`) over raw hex or `bg-brand-*` unless the exact brand colour is required.
- App code uses single quotes and no semicolons; `src/components/ui/*` follows generated shadcn formatting. Match the file you are editing.

## App structure

- Entry: `src/main.tsx` → `src/App.tsx` (lazy routes) → `src/layouts/RootLayout.tsx`.
- Roles and dashboard paths: `src/lib/auth.ts`; route guards: `src/components/auth/AuthGate.tsx`. Staff sign in at `/staff/login`.
- Admin code is isolated under `src/pages/admin`, `src/components/admin`, and `src/lib/admin`. Do not mix admin UI into student/instructor code.
- `src/pages/AdminDashboard.tsx` is legacy and unrouted. The live admin shell is `src/pages/admin/AdminLayout.tsx`.
- The admin console is widened via `/admin` route checks in `RootLayout`, not a separate layout container.

## Admin data

- Admin data is deterministic in-memory mock data from `src/lib/admin/mock-data.ts`; edits reset on reload.
- The only live admin backend action is instructor account creation at `/admin/instructors`, via the `create-instructor` Edge Function.
- Admin centre filter persists in `localStorage` (`fsdp-admin-centre`); date range is session state; student filters are URL-backed.
- Grading result processing, belt promotions, and application approvals are intentionally out of scope; applications are read-only.

## Supabase and env

- Use the root `.env`. Only `VITE_` variables reach the browser; never prefix server secrets with `VITE_`.
- `supabase/functions/*/index.ts` is a thin `Deno.serve` wrapper; logic lives in `handler.ts` so tests can import it. Keep that split.
- Deno npm imports are version-pinned (`npm:@supabase/supabase-js@2.118.0`, `npm:stripe@23.0.1`). Keep them aligned with `package.json` and `_shared/stripe.ts`.
- `verify_jwt = false` in `supabase/config.toml` is intentional. Handlers verify the bearer JWT and `public.users.role`, or Stripe's signature. Do not enable it as a "fix".
- Roles live in `public.users`; browser clients cannot write profiles or assign privileged roles. Role changes belong in server-side code or migrations.
- Migrations use `supabase/migrations/<timestamp>_<name>.sql`.

## Deployment

- Vercel runs `npm run build` into `dist` with SPA rewrites. `.vercelignore` excludes `supabase/`, `scripts/`, `tests/`, and env files, so backend changes deploy separately via the Supabase CLI commands in README.
