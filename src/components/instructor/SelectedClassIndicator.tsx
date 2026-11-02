import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SelectedClassIndicator({ className }: { className?: string }) {
    return (
        <span
            role="img"
            aria-label="Selected class"
            title="Selected class"
            className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", className)}
        >
            <Check aria-hidden="true" className="size-3" />
        </span>
    );
}
