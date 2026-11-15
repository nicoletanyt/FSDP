import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";

import FilterPopover, { FilterField } from "@/components/shared/filters/FilterPopover";
import BackLink from "@/components/shared/layout/BackLink";
import EmptyState from "@/components/shared/layout/EmptyState";
import PageHeader from "@/components/shared/layout/PageHeader";
import RetryAlert from "@/components/shared/layout/RetryAlert";
import { TableSkeleton } from "@/components/shared/skeletons";
import PaymentStatusBadge from "@/components/student/PaymentStatusBadge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, money } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useStudentPayments } from "@/hooks/use-student-payments";

const ALL = "all";

export default function StudentPayments() {
  const { session } = useAuth();
  const { payments, loading, error, retry } = useStudentPayments(session?.user.id);
  const [selected, setSelected] = useState<string>(ALL);

  const items = useMemo(() => [...new Set(payments.map((p) => p.item))].sort(), [payments]);

  const rows = useMemo(
    () =>
      payments
        .filter((p) => selected === ALL || p.item === selected)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [payments, selected],
  );

  const totalPaid = rows.filter((p) => p.status === "Paid").reduce((sum, p) => sum + p.amount, 0);

  return (
    <section className="w-full space-y-4">
      <div>
        <BackLink to="/profile">Back to profile</BackLink>
        <PageHeader
          title="Payments"
          actions={(
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total paid</p>
              <p className="text-xl font-semibold tabular-nums">{loading || error ? "—" : money.format(totalPaid)}</p>
            </div>
          )}
        />
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={5} label="Loading payments…" />
      ) : error ? (
        <RetryAlert message={error} onRetry={retry} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Membership, grading and class pass payments will show up here once confirmed."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selected === ALL
                ? `${rows.length} ${rows.length === 1 ? "payment" : "payments"}`
                : `${rows.length} of ${payments.length} payments`}
            </p>
            <FilterPopover
              title="Filter payments"
              activeCount={selected === ALL ? 0 : 1}
              onReset={() => setSelected(ALL)}
            >
              <FilterField
                label="Class or package"
                ariaLabel="Class or package filter"
                value={selected}
                onChange={setSelected}
                options={[{ value: ALL, label: "All payments" }, ...items.map((item) => ({ value: item, label: item }))]}
              />
            </FilterPopover>
          </div>

          <Card className="p-0">
            <Table className="min-w-[40rem]">
              <TableCaption className="sr-only">Payment history</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Date</TableHead>
                  <TableHead>Class / package</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-4">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">{p.item}</TableCell>
                    <TableCell className="whitespace-normal">{p.description}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell className="text-right tabular-nums">{money.format(p.amount)}</TableCell>
                    <TableCell className="px-4"><PaymentStatusBadge status={p.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </section>
  );
}
