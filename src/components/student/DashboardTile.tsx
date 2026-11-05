import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";

export type TileProps = {
  title: string;
  to: string;
  icon: LucideIcon;
  status?: string;
  badge?: number;
};

/** Self-service tile shared by the member and non-member dashboards. */
export function Tile({ title, status, to, icon: Icon, badge }: TileProps) {
  return (
    <Link
      to={to}
      className="relative flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl bg-card p-5 text-center text-sm text-card-foreground ring-1 ring-foreground/10 transition-colors hover:bg-accent hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {!!badge && (
        <span
          className="absolute right-3 top-3 grid min-h-7 min-w-7 place-items-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground"
          aria-label={`${badge} pending`}
        >
          {badge}
        </span>
      )}
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="font-semibold">{title}</span>
      {status && <span className="text-muted-foreground">{status}</span>}
    </Link>
  );
}
