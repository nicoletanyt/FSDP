import { useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import CountBadge from "@/components/CountBadge";
import FilterCombobox from "@/components/FilterCombobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The "Filter" button and popover from the instructor's student directory,
 * shared by every page that filters a list or calendar: labelled comboboxes,
 * then "Reset filters" and "Done".
 */
export default function FilterPopover({
    title,
    activeCount,
    onReset,
    children,
    className,
    contentClassName,
    controlClassName,
    titleClassName,
}: {
    /** Popover heading and the trigger's accessible name, e.g. "Filter students". */
    title: string;
    activeCount: number;
    onReset: () => void;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    /** Extra classes for the trigger and footer buttons. */
    controlClassName?: string;
    titleClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                ref={triggerRef}
                render={
                    <Button
                        variant="outline"
                        size="touch"
                        className={cn("gap-2", controlClassName, className)}
                    />
                }
                aria-label={
                    activeCount ? `${title}, ${activeCount} active filters` : title
                }
            >
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                <span>Filter</span>
                {activeCount > 0 && <CountBadge count={activeCount} />}
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className={cn("w-80 gap-3", contentClassName)}
                finalFocus={triggerRef}
            >
                <div className="space-y-1">
                    <PopoverTitle className={titleClassName}>{title}</PopoverTitle>
                </div>
                {children}
                <div className="flex flex-wrap justify-between gap-2 pt-4">
                    <Button
                        variant="ghost"
                        size="touch"
                        className={cn(
                            "h-auto min-h-11 max-w-full whitespace-normal py-2 lg:min-h-10",
                            controlClassName,
                        )}
                        disabled={!activeCount}
                        onClick={onReset}
                    >
                        Reset filters
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

/** One labelled filter inside a FilterPopover. */
export function FilterField({
    label,
    ...props
}: { label: string } & Omit<ComponentProps<typeof FilterCombobox>, "id">) {
    const id = useId();
    return (
        <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={id} className="shrink-0 text-sm text-muted-foreground">
                {label}
            </Label>
            <FilterCombobox id={id} className="h-11 lg:h-10" {...props} />
        </div>
    );
}
