# AGENT.md

Read `docs/architecture.md` for the feature map and `docs/database-schema.md`
for database shape.

Search before reading; read relevant line ranges. Skip `node_modules`,
lock files and generated types unless needed. Reuse context already read;
report only changes, verification and relevant blockers.

## Commands

- `npm run build` — frontend typecheck and Vite build.
- `npx tsc --noEmit` — frontend typecheck only.
- `npm run dev` — Vite dev server. Config reads `.env` from the repo root (`envDir`).
- Lint: no script configured.
- Backend checks require Deno:
  - `npm run check:functions` — type-check all five Edge Functions.
  - `npm run test:functions` — run Deno function tests.
  - Single test: `deno test --no-lock --allow-env supabase/functions/tests/stripe.test.ts`
- Offline Node tests (no cloud access):
  - `node --test tests/auth-db.test.mjs`
  - `node --test tests/seed-admin.test.mjs`
  - Instructor example: `node --test tests/instructor-data.test.mjs tests/instructor-db.test.mjs`
- Browser tests: see `tests/mobile-responsive/README.md`; run suites sequentially.
- Node 22.12+ or 24+.

## Stack quirks

- Routing uses `react-router` v8. Import from `react-router`, not `react-router-dom`.
- Use `import type` for type-only imports.
- shadcn is configured as `base-nova`: UI primitives import from `@base-ui/react/*`, not Radix. Add components with `npx shadcn@latest add <name>`; keep `components.json` aliases.
- Import `cn` from the `cn` package. `src/lib/utils.ts` only re-exports it, and most UI/app files use `import { cn } from 'cn'`.
- Theme tokens live in `src/index.css` under `@theme inline`. Prefer semantic utilities (`bg-primary`, `text-muted-foreground`, `text-brand-red-ink`) over raw hex or `bg-brand-*` unless the exact brand colour is required.
- App code uses single quotes and no semicolons; `src/components/ui/*` follows generated shadcn formatting. Match the file you are editing.

## Supabase and env

- Use the root `.env`. Only `VITE_` variables reach the browser; never prefix server secrets with `VITE_`.
- `supabase/functions/*/index.ts` is a thin `Deno.serve` wrapper; logic lives in `handler.ts` so tests can import it. Keep that split.
- Deno npm imports are version-pinned (`npm:@supabase/supabase-js@2.118.0`, `npm:stripe@23.0.1`). Keep them aligned with `package.json` and `_shared/stripe.ts`.
- `verify_jwt = false` in `supabase/config.toml` is intentional. Authentication
  depends on the handler: JWT/role, Stripe signature, or public guest checkout.
  Do not enable gateway verification as a blanket fix.
- Roles live in `public.users`; browser clients cannot write profiles or assign privileged roles. Role changes belong in server-side code or migrations.
- Migrations use `supabase/migrations/<timestamp>_<name>.sql`.

## Deployment

- Frontend and Supabase backend deploy separately; see `README.md`.
