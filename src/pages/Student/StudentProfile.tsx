import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, LogOut } from "lucide-react";

import { Button, buttonVariants } from "@/components/student/button";
import { Card } from "@/components/ui/card";
import PaymentStatusBadge from "@/components/student/PaymentStatusBadge";
import { useAuth } from "@/hooks/use-auth";
import { useStudentProfile } from "@/hooks/use-student-profile";
import { formatDate, money } from "@/lib/format";
import { beltBackground, type Payment, type Profile, type Standing } from "@/lib/student-profile";

/* ---------- Helpers ---------- */
const PREVIEW_COUNT = 3;

const standingCopy: Record<Standing, { chip: string; dot: string; note: string }> = {
  Active: { chip: "Active", dot: "bg-emerald-300", note: "Your membership is active." },
  Pending: {
    chip: "Pending payment",
    dot: "bg-amber-300",
    note: "We've received your application. Your membership activates once payment is confirmed.",
  },
  Expired: { chip: "Expired", dot: "bg-white", note: "Your membership has expired. Renew it to keep training." },
  None: { chip: "Not a member", dot: "bg-white/60", note: "You haven't applied for a membership yet." },
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
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
  const { standing, belt } = profile;
  const copy = standingCopy[standing];
  const active = standing === "Active";

  return (
    <article
      aria-label={`Digital membership card, ${copy.chip.toLowerCase()}`}
      className={`relative isolate flex min-h-60 w-full max-w-[26rem] flex-col justify-between gap-8 overflow-hidden rounded-3xl p-6 pb-8 text-white shadow-lg ring-1 ring-white/10 ${
        active ? "bg-brand-blue" : "bg-brand-blue/75"
      }`}
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
            <p className="text-xs text-white/70">{active ? "Member" : "Membership card"}</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            standing === "Expired" ? "bg-destructive text-destructive-foreground" : "bg-white/15"
          }`}
        >
          <span className={`size-1.5 rounded-full ${copy.dot}`} aria-hidden="true" />
          {copy.chip}
        </span>
      </div>

      {/* Bottom: identity */}
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-bold"
            >
              {initials(profile.fullName) || "?"}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold leading-tight tracking-tight">
              {profile.fullName || "Student"}
            </h2>
            <p className="text-sm text-white/80">{belt.name}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-white/15 pt-4 text-sm">
          <div className="min-w-0">
            <dt className="text-xs text-white/70">Member ID</dt>
            <dd className="truncate font-mono text-xs font-semibold" title={profile.memberId ?? undefined}>
              {active ? profile.memberId : standing === "None" ? "—" : "Issued once active"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/70">{active ? "Member since" : "Status"}</dt>
            <dd className="font-semibold">
              {active && profile.memberSince ? formatDate(profile.memberSince) : copy.chip}
            </dd>
          </div>
        </dl>
      </div>

      {/* Belt-colour strip */}
      <div
        className="absolute inset-x-0 bottom-0 h-2.5"
        style={{ background: beltBackground(belt.colour) }}
        aria-hidden="true"
      />
    </article>
  );
}

/* ---------- Membership details ---------- */
function MembershipDetails({ profile }: { profile: Profile }) {
  const { standing } = profile;
  const copy = standingCopy[standing];

  return (
    <Card className="gap-3 rounded-2xl p-5">
      <h2 className="font-bold">Membership details</h2>
      <p className={`text-sm ${standing === "Active" ? "text-muted-foreground" : "text-brand-red-ink"}`}>
        {copy.note}
      </p>
      <dl className="grid gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-semibold">{copy.chip}</dd>
        </div>
        {standing !== "None" && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Member ID</dt>
              <dd className={standing === "Active" ? "break-all font-mono text-sm font-semibold" : "font-semibold"}>
                {standing === "Active" ? profile.memberId : "Issued once active"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Current grade</dt>
              <dd className="font-semibold">{profile.belt.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Home dojo</dt>
              <dd className="font-semibold">{profile.homeDojo ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {standing === "Active" ? "Member since" : "Applied on"}
              </dt>
              <dd className="font-semibold">{profile.memberSince ? formatDate(profile.memberSince) : "—"}</dd>
            </div>
          </>
        )}
      </dl>
      {(standing === "None" || standing === "Expired") && (
        <Link to="/apply-membership" className={buttonVariants({ className: "mt-1 w-fit" })}>
          {standing === "Expired" ? "Renew membership" : "Apply for membership"}
        </Link>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */
export default function StudentProfile() {
  const { signOut } = useAuth();
  const { profile, loading, error } = useStudentProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const groups = profile ? groupByItem(profile.payments) : [];

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut();
    } catch (failure) {
      setSignOutError(
        failure instanceof Error ? failure.message : "Unable to sign out. Try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
      <main className="w-full">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">
              Aikido Shinju-Kai
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Membership Profile</h1>
            <p className="mt-1 text-muted-foreground">Your membership card and recent payments.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </header>
        {signOutError && <p role="alert" className="mt-3 text-sm text-destructive">{signOutError}</p>}

        {loading && <p className="mt-6 text-sm text-muted-foreground">Loading your membership…</p>}
        {!loading && (error || !profile) && (
          <p role="alert" className="mt-6 text-sm text-brand-red-ink">
            We couldn't load your membership. Please refresh the page.
          </p>
        )}

        {profile && (
          <>
            {/* Card + details */}
            {/* Fixed card column: an `auto` column shrank the card to its content and crushed it. */}
            <section
              aria-label="Membership"
              className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
            >
              <MembershipCard profile={profile} />
              <MembershipDetails profile={profile} />
            </section>

            {/* Payment history preview */}
            <div className="mb-3.5 mt-8 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Payment history</h2>
              {profile.payments.length > 0 && (
                <Link to="/payments" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}>
                  See all
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>

            {groups.length === 0 ? (
              <Card className="rounded-2xl p-5">
                <p className="text-muted-foreground">
                  No payments yet. Membership and grading fees will show up here.
                </p>
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
                            <PaymentStatusBadge status={p.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
  );
}
