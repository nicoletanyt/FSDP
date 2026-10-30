import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StudentShell from "./student-shell";
import { formatDate, money, paymentStatusStyles } from "./format";
import { mockProfile, type Payment, type Profile } from "./profile-data";

/* ---------- Helpers ---------- */
const PREVIEW_COUNT = 3;

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Group payments by class/package, newest group first, up to 3 recent payments each. */
function groupByItem(payments: Payment[]) {
  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date));
  const groups = new Map<string, Payment[]>();
  for (const p of sorted) groups.set(p.item, [...(groups.get(p.item) ?? []), p]);
  return [...groups.entries()].map(([item, list]) => ({
    item,
    total: list.length,
    recent: list.slice(0, PREVIEW_COUNT),
  }));
}

/* ---------- Membership card ---------- */
function MembershipCard({ profile }: { profile: Profile }) {
  const { membership, belt } = profile;
  const active = membership.standing === "Active";

  return (
    <article
      aria-label="Digital membership card"
      className="relative isolate flex w-full max-w-md flex-col justify-between gap-6 overflow-hidden rounded-3xl bg-brand-blue p-5 pb-7 text-white shadow-lg ring-1 ring-white/10 sm:aspect-[1.586/1] sm:p-6 sm:pb-8"
    >
      {/* soft decorative circles */}
      <div className="absolute -right-20 -top-24 -z-10 size-64 rounded-full bg-white/5" aria-hidden="true" />
      <div className="absolute -bottom-28 -left-16 -z-10 size-56 rounded-full bg-white/5" aria-hidden="true" />

      {/* Top: dojo + standing */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            className="size-9 rounded-full bg-white object-contain p-0.5"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="leading-tight">
            <p className="text-sm font-bold">Aikido Shinju-Kai</p>
            <p className="text-xs text-white/70">Member</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            active ? "bg-white/15" : "bg-destructive text-destructive-foreground"
          }`}
        >
          <span className={`size-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-white"}`} aria-hidden="true" />
          {membership.standing}
        </span>
      </div>

      {/* Bottom: identity + QR slot */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-bold"
              >
                {initials(profile.fullName)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold leading-tight tracking-tight">{profile.fullName}</h2>
              <p className="text-sm text-white/80">
                {belt.name} ({belt.colour} belt)
              </p>
            </div>
          </div>

          <dl className="mt-4 flex gap-6 text-sm">
            <div>
              <dt className="text-xs text-white/70">Member ID</dt>
              <dd className="font-mono font-semibold tabular-nums">{profile.memberId}</dd>
            </div>
            <div>
              <dt className="text-xs text-white/70">Expires</dt>
              <dd className="font-semibold">{formatDate(membership.expiresOn)}</dd>
            </div>
          </dl>
        </div>

        {/* TODO: QR code goes here (leaving empty for now) */}
        <div
          aria-hidden="true"
          className="grid size-24 shrink-0 place-items-center rounded-xl border-2 border-dashed border-white/40 text-center text-[0.7rem] leading-tight text-white/60"
        >
          QR code
        </div>
      </div>

      {/* Belt-colour strip */}
      <div className="absolute inset-x-0 bottom-0 h-2.5" style={{ backgroundColor: belt.hex }} aria-hidden="true" />
    </article>
  );
}

/* ---------- Page ---------- */
export default function StudentProfile() {
  // TODO: swap for a Supabase-backed hook, e.g. useStudentProfile()
  const profile = mockProfile;
  const { membership } = profile;

  const daysLeft = daysUntil(membership.expiresOn);
  const expiringSoon = membership.standing === "Active" && daysLeft >= 0 && daysLeft <= 30;
  const groups = groupByItem(profile.payments);

  return (
    <StudentShell>
      <main className="w-full">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">
            Aikido Shinju-Kai
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Membership Profile</h1>
          <p className="mt-1 text-muted-foreground">Your membership card and recent payments.</p>
        </header>

        {/* Card + details */}
        <section aria-label="Membership" className="mt-6 grid items-start gap-4 md:grid-cols-[auto_1fr]">
          <MembershipCard profile={profile} />

          <Card className="gap-3 rounded-2xl p-5">
            <h2 className="font-bold">Membership details</h2>
            <dl className="grid gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Plan</dt>
                <dd className="font-semibold">{membership.plan}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Expires</dt>
                <dd className="font-semibold">
                  {formatDate(membership.expiresOn)}
                  {expiringSoon && (
                    <span className="ml-2 text-sm font-semibold text-brand-red-ink">
                      {daysLeft === 0 ? "Expires today" : `${daysLeft} days left`}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Home dojo</dt>
                <dd className="font-semibold">{profile.homeDojo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Member since</dt>
                <dd className="font-semibold">{formatDate(profile.memberSince)}</dd>
              </div>
            </dl>
          </Card>
        </section>

        {/* Payment history preview */}
        <div className="mb-3.5 mt-8 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Payment history</h2>
          <Link to="/payments" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            See all
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {groups.length === 0 ? (
          <Card className="rounded-2xl p-5">
            <p className="text-muted-foreground">No payments yet. Fees for enrolled classes will show up here.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <Card key={g.item} className="gap-1 rounded-2xl p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold">{g.item}</h3>
                  {g.total > PREVIEW_COUNT && (
                    <span className="text-xs text-muted-foreground">+{g.total - PREVIEW_COUNT} older</span>
                  )}
                </div>
                <ul className="divide-y">
                  {g.recent.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(p.date)}, {p.method}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-semibold tabular-nums">{money.format(p.amount)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paymentStatusStyles[p.status]}`}>
                          {p.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </main>
    </StudentShell>
  );
}