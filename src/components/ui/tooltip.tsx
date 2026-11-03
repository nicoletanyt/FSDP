import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
    return <TooltipPrimitive.Provider delay={300} {...props} />;
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
    return <TooltipPrimitive.Root {...props} />;
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
    return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({ className, sideOffset = 6, children, ...props }: TooltipPrimitive.Popup.Props & { sideOffset?: number }) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-50">
                <TooltipPrimitive.Popup data-slot="tooltip-content" className={cn("max-w-[calc(100vw-2rem)] rounded-md bg-foreground px-3 py-1.5 text-xs break-words [overflow-wrap:anywhere] text-background shadow-md", className)} {...props}>
                    {children}
                </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
    );
}

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };
