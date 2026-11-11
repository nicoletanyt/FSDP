import { supabase } from "@/lib/supabase";

export type Belt = { label: string; colour: string | null };

/** What the member dashboard shows, read from public.student_dashboard_summary(). */
export type DashboardSummary = {
  belt: Belt | null;
  /** null when the student holds the highest grade on their track. */
  nextBelt: Belt | null;
  requirements: {
    sessionsDone: number;
    /** null when the next grade has no session minimum (children's grades). */
    sessionsRequired: number | null;
    monthsDone: number;
    monthsRequired: number | null;
    feeCents: number | null;
    /** True once an application (only created after payment) exists. */
    feePaid: boolean;
  };
  counts: {
    classesBooked: number;
    /** Present or late as a % of marked sessions; null before anything is marked. */
    attendanceRate: number | null;
    gradingsOpen: number;
  };
  nextClass: { title: string; startsAt: string; centre: string; instructor: string | null } | null;
};

type Row = Record<string, unknown>;
const record = (value: unknown): Row | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (typeof value === "string" ? value : null);

function belt(value: unknown): Belt | null {
  const row = record(value);
  const label = str(row?.label);
  return row && label ? { label, colour: str(row.colour) } : null;
}

/** Returns null when the account has no linked student record. */
export function parseDashboardSummary(value: unknown): DashboardSummary | null {
  const row = record(value);
  if (!row?.linked) return null;
  const req = record(row.requirements) ?? {};
  const counts = record(row.counts) ?? {};
  const next = record(row.next_class);
  const marked = num(counts.sessions_marked) ?? 0;
  const attended = num(counts.sessions_attended) ?? 0;
  const startsAt = str(next?.starts_at);

  return {
    belt: belt(row.belt),
    nextBelt: belt(row.next_belt),
    requirements: {
      sessionsDone: num(req.sessions_done) ?? 0,
      sessionsRequired: num(req.sessions_required),
      monthsDone: num(req.months_done) ?? 0,
      monthsRequired: num(req.months_required),
      feeCents: num(req.fee_cents),
      feePaid: req.fee_paid === true,
    },
    counts: {
      classesBooked: num(counts.classes_booked) ?? 0,
      attendanceRate: marked ? Math.round((attended / marked) * 100) : null,
      gradingsOpen: num(counts.gradings_open) ?? 0,
    },
    nextClass: next && startsAt
      ? {
          title: str(next.title) ?? "Class",
          startsAt,
          centre: str(next.centre) ?? "",
          instructor: str(next.instructor),
        }
      : null,
  };
}

export async function fetchDashboardSummary() {
  const { data, error } = await supabase.rpc("student_dashboard_summary");
  if (error) throw error;
  return parseDashboardSummary(data);
}
