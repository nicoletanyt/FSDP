import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Popover(props: PopoverPrimitive.Root.Props) {
    return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
    className,
    align = "end",
    sideOffset = 8,
    ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, "align" | "sideOffset">) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
                <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className={cn("grid max-h-[min(var(--available-height),calc(100dvh-2rem))] w-64 max-w-[calc(100vw-2rem)] gap-4 overflow-y-auto overscroll-contain rounded-lg bg-popover p-4 text-sm break-words [overflow-wrap:anywhere] text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none", className)}
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
    return <PopoverPrimitive.Title className={cn("font-semibold", className)} {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle };
