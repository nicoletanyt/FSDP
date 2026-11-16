import { Link } from "react-router";
import { CalendarDays, GraduationCap, IdCard, Mail, MapPin, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import PageHeader from "@/components/shared/layout/PageHeader";
import { StatusBadge, type BadgeTone } from "@/components/shared/status/StatusBadge";
import { useAuth } from "@/hooks/use-auth";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { buttonVariants } from "@/components/ui/button";
import ChangePasswordDialog from "@/components/profile/ChangePasswordDialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useStudentProfile } from "@/hooks/use-student-profile";
import { formatDate } from "@/lib/format";
import { isStudentMembership, membershipLabel, resolveMembershipType } from "@/lib/membership";
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

const standingTone: Record<Standing, BadgeTone> = {
  Active: "success",
  Pending: "warning",
  Expired: "danger",
  None: "neutral",
};

// One labelled fact: icon and label above, value below.
function Detail({ icon: Icon, term, children }: { icon: LucideIcon; term: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {term}
      </dt>
      <dd className="font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function MembershipTypePill() {
  const type = resolveMembershipType();
  return (
    <StatusBadge tone="info" dot={false}>
      {isStudentMembership(type) ? <GraduationCap aria-hidden="true" /> : <User aria-hidden="true" />}
      {membershipLabel(type)}
    </StatusBadge>
  );
}

// One heading style for every card on this page: a semibold h2, with anything that
// belongs to it (a status pill) on the right.
function ProfileCardHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base leading-snug font-semibold">{title}</h2>
      {children}
    </CardHeader>
  );
}

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
    <Card>
      <ProfileCardHeader title="Membership details">
        <StatusBadge tone={standingTone[standing]}>{copy.chip}</StatusBadge>
      </ProfileCardHeader>
      <CardContent className="space-y-4">
      {/* Active needs no note: the pill says it. Other states say what happens next. */}
      {standing !== "Active" && <p className="text-sm text-brand-red-ink">{copy.note}</p>}
      {standing !== "None" && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Detail icon={IdCard} term="Member ID">
            {standing === "Active"
              ? <span className="break-all font-mono text-sm">{profile.memberId}</span>
              : "Issued once active"}
          </Detail>
          <Detail icon={GraduationCap} term="Current grade">{profile.belt.name}</Detail>
          <Detail icon={MapPin} term="Home dojo">{profile.homeDojo ?? "—"}</Detail>
          {/* Moved here from the Credits page: it describes the membership, not a purchase. */}
          <Detail icon={Users} term="Membership type">
            <MembershipTypePill />
          </Detail>
          <Detail icon={CalendarDays} term={standing === "Active" ? "Member since" : "Applied on"}>
            {profile.memberSince ? formatDate(profile.memberSince) : "—"}
          </Detail>
        </dl>
      )}
      {(standing === "None" || standing === "Expired") && (
        <Link to="/apply-membership" className={buttonVariants({ className: "mt-1 w-fit" })}>
          {standing === "Expired" ? "Renew membership" : "Apply for membership"}
        </Link>
      )}
      </CardContent>
    </Card>
  );
}

/* ---------- Page ---------- */
export default function StudentProfile() {
  const { profile, loading, error, reload } = useStudentProfile();
  // Sign-in details, moved here from the phone menu.
  const { profile: account } = useAuth();

  return (
      <section className="w-full">
        <PageHeader title="Profile" />

        {loading && <DetailSkeleton label="Loading your membership…" />}
        {!loading && (error || !profile) && (
          <RetryAlert message="We couldn't load your membership." onRetry={reload} />
        )}

        {profile && (
          <>
            {/* Card + details */}
            {/* Fixed card column: an `auto` column shrank the card to its content and crushed it. */}
            <section
              aria-label="Membership"
              className="grid items-start gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
            >
              <MembershipCard profile={profile} />
              <MembershipDetails profile={profile} />
            </section>

            <Card className="mt-6">
              <ProfileCardHeader title="Account" />
              <CardContent className="space-y-5">
                <dl>
                  <Detail icon={Mail} term="Email">{account?.email ?? "—"}</Detail>
                </dl>
                <ChangePasswordDialog accountType="student" />
              </CardContent>
            </Card>
          </>
        )}
      </section>
  );
}
