export type Payment = {
  id: string;
  date: string; // ISO date
  item: string; // the class or package this payment belongs to
  description: string; // e.g. "Term 4 fee"
  method: "Stripe" | "PayNow";
  amount: number; // SGD
  status: "Paid" | "Pending" | "Refunded";
};

export type Profile = {
  memberId: string;
  fullName: string;
  photoUrl: string | null;
  belt: { name: string; colour: string; hex: string };
  homeDojo: string;
  memberSince: string; // ISO date
  membership: {
    standing: "Active" | "Expired" | "Pending";
    plan: string;
    expiresOn: string; // ISO date
  };
  payments: Payment[];
};

// TODO: replace with Supabase queries (users + payments tables).
export const mockProfile: Profile = {
  memberId: "ASK-2025-0142",
  fullName: "Jess Tan",
  photoUrl: null,
  belt: { name: "5th Kyu", colour: "Yellow", hex: "#e8b923" },
  homeDojo: "Bishan Dojo",
  memberSince: "2025-03-10",
  membership: {
    standing: "Active",
    plan: "Annual membership",
    expiresOn: "2026-12-14",
  },
  payments: [
    { id: "pay_01", date: "2026-09-02", item: "Adult Beginners Aikido", description: "Term 4 fee", method: "Stripe", amount: 180, status: "Paid" },
    { id: "pay_02", date: "2026-06-03", item: "Adult Beginners Aikido", description: "Term 3 fee", method: "PayNow", amount: 180, status: "Paid" },
    { id: "pay_03", date: "2026-03-11", item: "Adult Beginners Aikido", description: "Term 2 fee", method: "Stripe", amount: 180, status: "Paid" },
    { id: "pay_04", date: "2025-12-02", item: "Adult Beginners Aikido", description: "Term 1 fee", method: "Stripe", amount: 180, status: "Paid" },
    { id: "pay_05", date: "2026-03-10", item: "Annual membership", description: "Renewal 2026", method: "Stripe", amount: 60, status: "Paid" },
    { id: "pay_06", date: "2025-03-10", item: "Annual membership", description: "Joining fee", method: "PayNow", amount: 60, status: "Paid" },
    { id: "pay_07", date: "2026-03-04", item: "Weapons Workshop", description: "Deposit", method: "Stripe", amount: 25, status: "Refunded" },
  ],
};