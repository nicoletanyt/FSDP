import { StatusBadge, type BadgeTone } from "@/components/shared/status/StatusBadge";
import type { Payment } from "@/lib/student-profile";

const paymentStatusTones: Record<Payment["status"], BadgeTone> = {
  Paid: "success",
  Pending: "warning",
  Refunded: "neutral",
};

export default function PaymentStatusBadge({ status }: { status: Payment["status"] }) {
  return <StatusBadge tone={paymentStatusTones[status]}>{status}</StatusBadge>;
}
