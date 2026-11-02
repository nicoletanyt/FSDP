import type { Payment } from "./profile-data";

export const money = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

export const paymentStatusStyles: Record<Payment["status"], string> = {
  Paid: "bg-primary/10 text-primary",
  Pending: "bg-muted text-muted-foreground",
  Refunded: "bg-brand-red/10 text-brand-red-ink",
};