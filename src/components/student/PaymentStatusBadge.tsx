import type { Payment } from "@/lib/student-profile";
import { cn } from "@/lib/utils";

const paymentStatusStyles: Record<Payment["status"], string> = {
  Paid: "bg-primary/10 text-primary",
  Pending: "bg-muted text-muted-foreground",
  Refunded: "bg-brand-red/10 text-brand-red-ink",
};

export default function PaymentStatusBadge({ status, className }: { status: Payment["status"]; className?: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", paymentStatusStyles[status], className)}>
      {status}
    </span>
  );
}
