import { CircleCheck, CircleMinus, CircleX } from "lucide-react";
import type { AttendanceState } from "@/lib/instructor/types";
import { cn } from "@/lib/utils";

/** Read-only attendance state, shared with the admin calendar's class details. */
export default function AttendanceStateBadge({ name, value }: { name: string; value: AttendanceState }) {
    const label =
        value === "present"
            ? "Present"
            : value === "late"
                ? "Late"
                : value === "excused"
                    ? "Excused"
                    : value === "absent"
                        ? "Absent"
                        : "Unmarked";
    return (
        <div className="flex size-11 shrink-0 items-center justify-center text-xs lg:h-auto lg:w-15">
            <span
                role="img"
                aria-label={`Attendance for ${name}: ${label}`}
                title={label}
                className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    value === "late" && "w-auto rounded-md px-1.5 text-xs font-medium",
                    value === "present"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : value === "late"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            : value === "absent"
                                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : "bg-muted text-muted-foreground",
                )}
            >
                {value === "late" ? (
                    "Late"
                ) : value === "present" ? (
                    <CircleCheck aria-hidden="true" className="size-4" />
                ) : value === "absent" ? (
                    <CircleX aria-hidden="true" className="size-4" />
                ) : (
                    <CircleMinus aria-hidden="true" className="size-4" />
                )}
            </span>
        </div>
    );
}
