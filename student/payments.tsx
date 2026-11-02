import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StudentShell from "./student-shell";
import { formatDate, money, paymentStatusStyles } from "./format";
import { mockProfile } from "./profile-data";

const ALL = "All";

export default function StudentPayments() {
  // TODO: swap for a Supabase-backed hook, e.g. usePayments()
  const payments = mockProfile.payments;
  const [selected, setSelected] = useState<string>(ALL);

  const items = useMemo(() => [ALL, ...new Set(payments.map((p) => p.item))], [payments]);

  const rows = useMemo(
    () =>
      payments
        .filter((p) => selected === ALL || p.item === selected)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [payments, selected],
  );

  const totalPaid = rows.filter((p) => p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);

  return (
    <StudentShell>
      <main className="w-full">
        <Link to="/profile" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 gap-1.5" })}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Membership Profile
        </Link>

        <header className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-red-ink">
              Aikido Shinju-Kai
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">All payments</h1>
            <p className="mt-1 text-muted-foreground">
              {rows.length} {rows.length === 1 ? "payment" : "payments"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total paid</p>
            <p className="text-xl font-bold tabular-nums">{money.format(totalPaid)}</p>
          </div>
        </header>

        {/* Filter by class/package */}
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by class or package">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSelected(item)}
              aria-pressed={selected === item}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                selected === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:border-primary"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <Card className="mt-4 rounded-2xl p-0">
          {rows.length === 0 ? (
            <p className="p-5 text-muted-foreground">No payments yet. Fees for enrolled classes will show up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">Payment history</caption>
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Date</th>
                    <th scope="col" className="px-3 py-3 font-medium">Class / package</th>
                    <th scope="col" className="px-3 py-3 font-medium">Description</th>
                    <th scope="col" className="px-3 py-3 font-medium">Method</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Amount</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-5 py-3">{formatDate(p.date)}</td>
                      <td className="px-3 py-3 font-medium">{p.item}</td>
                      <td className="px-3 py-3">{p.description}</td>
                      <td className="px-3 py-3">{p.method}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money.format(p.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${paymentStatusStyles[p.status]}`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </StudentShell>
  );
}