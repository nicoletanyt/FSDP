export const money = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}
