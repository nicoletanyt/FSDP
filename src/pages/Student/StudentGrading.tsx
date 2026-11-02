import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { CalendarX2, CheckCircle2, Lock } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { mockGradingWindow } from "@/lib/student-grading";
import { mockProfile } from "@/lib/student-profile";
import { mockStudent } from "@/lib/student-dashboard";

/* ---------- Form types & helpers ---------- */
type FormState = {
  dob: string;
  sex: "" | "Male" | "Female";
  address: string;
  nationality: string;
  occupation: string;
  rankPlace: string;
  rankDate: string;
  method: "" | "Examination" | "Recommendation";
  sessionId: string;
  remarks: string;
  agree: boolean;
  signature: string;
};
type Errors = Partial<Record<keyof FormState, string>>;
type TextField = Exclude<keyof FormState, "sex" | "method" | "sessionId" | "agree">;

const EMPTY: FormState = {
  dob: "",
  sex: "",
  address: "",
  nationality: "",
  occupation: "",
  rankPlace: "",
  rankDate: "",
  method: "",
  sessionId: "",
  remarks: "",
  agree: false,
  signature: "",
};

// Order used to scroll to the first error.
const FIELD_ORDER: (keyof FormState)[] = [
  "dob", "sex", "address", "nationality", "occupation",
  "rankPlace", "rankDate", "method", "sessionId", "agree", "signature",
];

const REQUIRED = "This is a required question";
const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const todayLabel = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.dob) e.dob = REQUIRED;
  else if (f.dob > todayIso) e.dob = "Date of birth must be in the past";
  if (!f.sex) e.sex = REQUIRED;
  if (!f.address.trim()) e.address = REQUIRED;
  if (!f.nationality.trim()) e.nationality = REQUIRED;
  if (!f.occupation.trim()) e.occupation = REQUIRED;
  if (!f.rankPlace.trim()) e.rankPlace = REQUIRED;
  if (!f.rankDate) e.rankDate = REQUIRED;
  else if (f.rankDate > todayIso) e.rankDate = "Date must not be in the future";
  if (!f.method) e.method = REQUIRED;
  if (!f.sessionId) e.sessionId = REQUIRED;
  if (!f.agree) e.agree = "Please confirm the declaration";
  if (!f.signature.trim()) e.signature = REQUIRED;
  return e;
}

/* ---------- Google-Forms-style building blocks ---------- */
const underline =
  "w-full border-0 border-b border-border bg-transparent px-0 py-2 text-base outline-none transition placeholder:text-muted-foreground/70 focus:border-b-2 focus:border-primary";

function Question({
  id, label, required, hint, error, children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`q-${id}`}
      className={`rounded-xl border border-l-4 bg-card p-5 shadow-sm transition-colors focus-within:border-l-primary ${
        error ? "border-destructive/60 border-l-destructive" : "border-l-transparent"
      }`}
    >
      <p id={`${id}-label`} className="text-base font-medium">
        {label}
        {required && <span className="ml-1 text-brand-red-ink" aria-hidden="true">*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </p>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-brand-red-ink">
          {error}
        </p>
      )}
    </section>
  );
}

function Choice({
  name, value, checked, onChange, type = "radio", children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  type?: "radio" | "checkbox";
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="mt-1 size-4 accent-primary" />
      <span>{children}</span>
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-base text-muted-foreground">{label}</p>
      <div className="mt-1 rounded-md bg-muted/60 px-3 py-2 text-lg font-medium">{value}</div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function StudentGrading() {
  // TODO: swap for Supabase-backed hooks (student, profile, grading window)
  const student = mockStudent;
  const profile = mockProfile;
  const window_ = mockGradingWindow;
  const r = student.requirements;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const text = (key: TextField) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, e.target.value);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    const first = FIELD_ORDER.find((k) => found[k]);
    if (first) {
      document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // TODO: insert into Supabase (grading_applications) + upload `file` to Storage.
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleClear() {
    setForm(EMPTY);
    setFile(null);
    setErrors({});
  }

  /* ----- State 1: no applications open ----- */
  if (!window_.open) {
    return (
        <main className="w-full">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Grading Applications</h1>
          <Card className="mt-6 items-center gap-4 rounded-2xl px-6 py-14 text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarX2 className="size-8" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight">No applications open for now.</h2>
              <p className="mt-1 text-muted-foreground">Come back another time!</p>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              We'll email you when you're eligible and a grading is open for applications.
            </p>
            <Link to="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Back to dashboard
            </Link>
          </Card>
        </main>
    );
  }

  const chosen = window_.sessions.find((s) => s.id === form.sessionId);

  /* ----- State 3: submitted ----- */
  if (submitted) {
    return (
        <div className="min-h-[80vh] bg-transparent pb-14 pt-6">
          <main className="w-full">
            <Card className="gap-3 rounded-xl border-t-[10px] border-t-primary p-6">
              <h1 className="text-2xl font-bold tracking-tight">Application submitted</h1>
              <p className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                Your response has been recorded.
              </p>
              <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                <ReadOnlyField label="Rank applied for" value={student.nextBelt.name} />
                <ReadOnlyField label="Grading session" value={chosen ? `${formatDateTime(chosen.startsAt)}, ${chosen.centre}` : "-"} />
              </dl>
              <p className="text-sm text-muted-foreground">Your application is now with the administrators for review.</p>
              <Link to="/dashboard" className={buttonVariants({ className: "mt-2 w-fit" })}>
                Back to dashboard
              </Link>
            </Card>
          </main>
        </div>
    );
  }

  /* ----- State 2: application form ----- */
  const checks = [
    { label: "Sessions attended", value: `${r.sessions.done} / ${r.sessions.required}`, ok: r.sessions.done >= r.sessions.required },
    { label: "Time in rank", value: `${r.monthsInRank.done} / ${r.monthsInRank.required} months`, ok: r.monthsInRank.done >= r.monthsInRank.required },
    { label: "Grading fee", value: r.feePaid ? "Paid" : "Unpaid", ok: r.feePaid },
  ];

  return (
      <div className="min-h-[80vh] bg-transparent pb-14 pt-6">
        <main className="w-full">
          <form onSubmit={handleSubmit} noValidate className="grid gap-3">
            {/* Form header */}
            <Card className="gap-2 rounded-xl border-t-[10px] border-t-primary p-6">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dan/Kyu Grading Application</h1>
              <p className="text-muted-foreground">
                Applying for {student.nextBelt.name}. Please fill in the blanks below and sign at the end.
              </p>
              <hr className="my-2" />
              <p className="text-sm">
                Responding as <b>{profile.fullName}</b> ({profile.memberId})
              </p>
              <p className="text-sm text-brand-red-ink">* Indicates required question</p>
            </Card>

            {/* Eligibility checklist */}
            <Card className="gap-3 rounded-xl p-5">
              <h2 className="text-lg font-semibold">Your eligibility</h2>
              <ul className="grid gap-2 sm:grid-cols-3">
                {checks.map((c) => (
                  <li key={c.label} className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                    <span className="text-muted-foreground">{c.label}</span>
                    <b className="block text-base tabular-nums">
                      {c.value}
                      {c.ok && <span className="ml-1 text-primary">✓</span>}
                    </b>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Auto-filled */}
            <Card className="gap-3 rounded-xl p-5">
              <h2 className="flex items-center gap-2 font-medium">
                <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                Auto-filled from your membership
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Membership no." value={profile.memberId} />
                <ReadOnlyField label="Full name" value={profile.fullName} />
                <ReadOnlyField label="Present rank" value={`${student.belt.name} (${student.belt.colour} belt)`} />
                <ReadOnlyField label="Rank applied for" value={`${student.nextBelt.name} (${student.nextBelt.colour} belt)`} />
                <ReadOnlyField label="Sessions attended since present rank" value={`${r.sessions.done} sessions`} />
                <ReadOnlyField label="Name of dojo" value={profile.homeDojo} />
                <ReadOnlyField label="Date of registration" value={formatDate(profile.memberSince)} />
              </div>
            </Card>

            {/* Personal details */}
            <Question id="dob" label="Date of birth" required error={errors.dob}>
              <input
                type="date" max={todayIso} value={form.dob} onChange={text("dob")}
                aria-labelledby="dob-label" aria-invalid={!!errors.dob}
                className={`${underline} max-w-48`}
              />
            </Question>

            <Question id="sex" label="Sex" required error={errors.sex}>
              <div role="radiogroup" aria-labelledby="sex-label">
                {(["Male", "Female"] as const).map((v) => (
                  <Choice key={v} name="sex" value={v} checked={form.sex === v} onChange={() => set("sex", v)}>{v}</Choice>
                ))}
              </div>
            </Question>

            <Question id="address" label="Address" required error={errors.address}>
              <input
                type="text" value={form.address} onChange={text("address")} placeholder="Your answer"
                aria-labelledby="address-label" aria-invalid={!!errors.address} autoComplete="street-address"
                className={underline}
              />
            </Question>

            <Question id="nationality" label="Nationality" required error={errors.nationality}>
              <input
                type="text" value={form.nationality} onChange={text("nationality")} placeholder="Your answer"
                aria-labelledby="nationality-label" aria-invalid={!!errors.nationality} autoComplete="country-name"
                className={underline}
              />
            </Question>

            <Question id="occupation" label="Occupation" required error={errors.occupation}>
              <input
                type="text" value={form.occupation} onChange={text("occupation")} placeholder="Your answer"
                aria-labelledby="occupation-label" aria-invalid={!!errors.occupation}
                className={underline}
              />
            </Question>

            {/* Rank history */}
            <Question id="rankPlace" label="Where was your present rank obtained?" required error={errors.rankPlace}>
              <input
                type="text" value={form.rankPlace} onChange={text("rankPlace")} placeholder="Your answer"
                aria-labelledby="rankPlace-label" aria-invalid={!!errors.rankPlace}
                className={underline}
              />
            </Question>

            <Question id="rankDate" label="When was your present rank obtained?" required error={errors.rankDate}>
              <input
                type="date" max={todayIso} value={form.rankDate} onChange={text("rankDate")}
                aria-labelledby="rankDate-label" aria-invalid={!!errors.rankDate}
                className={`${underline} max-w-48`}
              />
            </Question>

            <Question id="method" label="How was your present rank obtained?" required error={errors.method}>
              <div role="radiogroup" aria-labelledby="method-label">
                <Choice name="method" value="Examination" checked={form.method === "Examination"} onChange={() => set("method", "Examination")}>
                  By examination
                </Choice>
                <Choice name="method" value="Recommendation" checked={form.method === "Recommendation"} onChange={() => set("method", "Recommendation")}>
                  By recommendation
                </Choice>
              </div>
            </Question>

            {/* Exam timeslot */}
            <Question
              id="sessionId"
              label="Which grading session would you like to attend?"
              required
              hint="This is your upcoming examination date."
              error={errors.sessionId}
            >
              <div role="radiogroup" aria-labelledby="sessionId-label">
                {window_.sessions.map((s) => (
                  <Choice key={s.id} name="sessionId" value={s.id} checked={form.sessionId === s.id} onChange={() => set("sessionId", s.id)}>
                    <span className="font-medium">{formatDateTime(s.startsAt)}</span>
                    <span className="block text-sm text-muted-foreground">{s.centre}</span>
                  </Choice>
                ))}
              </div>
            </Question>

            {/* Remarks + upload */}
            <Question id="remarks" label="Remarks" hint="Optional">
              <textarea
                rows={2} value={form.remarks} onChange={text("remarks")} placeholder="Your answer"
                aria-labelledby="remarks-label" className={`${underline} resize-y`}
              />
            </Question>

            <Question id="file" label="Supporting document" hint="Optional. PDF, JPG or PNG.">
              <input
                type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-labelledby="file-label"
                className="text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:border-primary"
              />
              {file && <p className="mt-2 text-sm text-muted-foreground">Selected: {file.name}</p>}
            </Question>

            {/* Declaration + signature */}
            <Question id="agree" label="Declaration" required error={errors.agree}>
              <Choice type="checkbox" name="agree" value="yes" checked={form.agree} onChange={() => set("agree", !form.agree)}>
                I hereby make my application, and the details above are true and correct.
              </Choice>
            </Question>

            <Question id="signature" label="Signature" required hint="Type your full name to sign." error={errors.signature}>
              <input
                type="text" value={form.signature} onChange={text("signature")} placeholder="Your full name"
                aria-labelledby="signature-label" aria-invalid={!!errors.signature}
                className={underline}
              />
            </Question>

            <Card className="gap-1 rounded-xl p-5">
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="font-medium">{todayLabel}</p>
            </Card>

            <div className="flex items-center justify-between gap-3 pt-1">
              <Button type="submit">Submit</Button>
              <Button type="button" variant="ghost" onClick={handleClear}>Clear form</Button>
            </div>
          </form>
        </main>
      </div>
  );
}
