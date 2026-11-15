import { Link } from "react-router";

import PageHeader from "@/components/shared/layout/PageHeader";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { buttonVariants } from "@/components/ui/button";
import ChangePasswordDialog from "@/components/profile/ChangePasswordDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudentProfile } from "@/hooks/use-student-profile";
import { formatDate } from "@/lib/format";
import { beltBackground, type Profile, type Standing } from "@/lib/student-profile";

/* ---------- Helpers ---------- */
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
    <Card className="gap-3 p-4">
      <h2 className="font-semibold">Membership details</h2>
      <p className={`text-sm ${standing === "Active" ? "text-muted-foreground" : "text-brand-red-ink"}`}>
        {copy.note}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
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
  const { profile, loading, error, reload } = useStudentProfile();

  return (
      <section className="w-full">
        <PageHeader title="Profile" />

        {loading && <div className="mt-6"><DetailSkeleton label="Loading your membership…" /></div>}
        {!loading && (error || !profile) && (
          <div className="mt-6"><RetryAlert message="We couldn't load your membership." onRetry={reload} /></div>
        )}

        {profile && (
          <>
            {/* Card + details */}
            {/* Fixed card column: an `auto` column shrank the card to its content and crushed it. */}
            <section
              aria-label="Membership"
              className="mt-6 grid items-start gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
            >
              <MembershipCard profile={profile} />
              <MembershipDetails profile={profile} />
            </section>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent>
                <ChangePasswordDialog accountType="student" />
              </CardContent>
            </Card>
          </>
        )}
      </section>
  );
}
