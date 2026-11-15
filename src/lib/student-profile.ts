export type Payment = {
  id: string;
  date: string; // ISO timestamp
  item: string; // the class or package this payment belongs to
  description: string;
  method: string;
  amount: number; // SGD, in dollars
  status: "Paid" | "Pending" | "Refunded";
};

/** "None" means the account has no students row yet (never applied). */
export type Standing = "Active" | "Pending" | "Expired" | "None";

export type Profile = {
  memberId: string | null;
  fullName: string;
  photoUrl: string | null;
  belt: { name: string; colour: string | null };
  homeDojo: string | null;
  memberSince: string | null; // ISO date the application was made
  standing: Standing;
  payments: Payment[];
};

const beltHex: Record<string, string> = {
  red: "#d62828",
  gold: "#d4a017",
  yellow: "#e8b923",
  orange: "#f08c00",
  green: "#2b9348",
  purple: "#7b2cbf",
  blue: "#1d4ed8",
  silver: "#c0c0c0",
  brown: "#7f4f24",
  black: "#111111",
};

/** Single colour for a belt (the main tone of a two-tone belt), e.g. for an SVG fill. */
export function beltHexFor(colour: string | null) {
  return beltHex[(colour ?? "").toLowerCase().split("-")[0]] ?? "#e5e7eb";
}

/** CSS background for a belt colour such as "Blue" or two-tone "Blue-Gold". */
export function beltBackground(colour: string | null) {
  const tones = (colour ?? "")
    .toLowerCase()
    .split("-")
    .map((tone) => beltHex[tone])
    .filter(Boolean);
  if (tones.length === 0) return "#e5e7eb"; // unranked: plain white belt
  if (tones.length === 1) return tones[0];
  return `linear-gradient(90deg, ${tones[0]} 0 70%, ${tones[1]} 70% 100%)`;
}
