# Membership confirmation email

## Implementation

- `supabase/functions/send-membership-email/index.ts`: thin Deno entry point.
- `supabase/functions/send-membership-email/handler.ts`: authenticated handler,
  Resend delivery, escaped HTML and plain-text email, recipient/ID verification.
- `src/pages/Student/ApplyMembership.tsx`: starts a non-awaited function call
  after the application RPC commits. Email errors do not block SPA navigation
  or change a successful submission into a failed one.

The caller supplies `{ email, name, membershipId }`. The handler validates the
student JWT and role, looks up only the caller's `students` record, and checks
email/member number against the saved record. Recipient, member number and name
in the email come from the database, not untrusted request content.

The subject is `Welcome to Aikido Shinju-Kai!`; the email highlights Membership
ID and says Payment Instructions will follow within one business day. No bank
details or payment links are invented. This function does not send those later
instructions automatically; the dojo must fulfill that separate workflow.

## Production setup (required; not automatically deployed)

1. Verify a sender domain in Resend. The default `onboarding@resend.dev` test
   sender cannot be used for arbitrary member recipients.
2. In Supabase Dashboard → Edge Functions → Secrets, configure:
   - `RESEND_API_KEY`: server-only Resend API key.
   - `MEMBERSHIP_EMAIL_FROM`: e.g. `Aikido Shinju-Kai <membership@your-verified-domain.com>`.
   - `APP_URL`: exact frontend origin, e.g. `https://your-app.example.com`.
   - `AUTH_ALLOWED_ORIGINS`: optional comma-separated additional allowed origins.
3. Supabase supplies its legacy Auth and service-role environment values to
   hosted functions. Never put service-role or Resend keys in `VITE_` variables.
4. From this repository, deploy only this function (current CLI syntax):

   ```powershell
   npx supabase functions deploy send-membership-email --remote=YOUR_PROJECT_REF --use-api
   ```

   `supabase/config.toml` disables gateway JWT verification intentionally: the
   handler validates the bearer token and current student role itself.
5. Deploy/restart the updated frontend. Submit an application using an email
   address you own. Check Supabase function logs and Resend's email dashboard.
   Provider `accepted` is not a guarantee of inbox delivery; check bounce/spam
   results and domain DNS configuration.

No SQL migration is required for this email feature. Editing the repository or
putting values in root `.env` alone does not configure deployed Edge Functions.

## Delivery limitations

This is the requested best-effort browser-triggered confirmation, not a durable
outbox. Normal React Router navigation does not unload the page; closing the tab,
signing out immediately, network failure or missing secrets can prevent delivery.
Errors are caught without logging personal details. They do not block the
success page and the UI does not claim the email was delivered.

A stable Resend idempotency key deduplicates repeated calls for the same record
and member number within Resend's **24-hour** window. It is not permanent send
tracking. Guaranteed sending/retries and durable rate limiting require a
separate server-side outbox/queue workflow, not a fire-and-forget browser request.

## Verification

```powershell
npx deno check --no-config --no-lock --node-modules-dir=none supabase/functions/send-membership-email/index.ts
npx deno test --no-config --no-lock --node-modules-dir=none --allow-env supabase/functions/tests/membership-email.test.ts
npx tsc --noEmit
```

Tests mock delivery; they do not send real email or use live credentials.
