import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Sheet(props: SheetPrimitive.Root.Props) {
    return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetContent({ className, children, side = "right", ...props }: SheetPrimitive.Popup.Props & { side?: "left" | "right" }) {
    return (
        <SheetPrimitive.Portal>
            <SheetPrimitive.Backdrop
                data-slot="sheet-overlay"
                className="fixed inset-0 z-50 bg-black/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
            />
            <SheetPrimitive.Popup
                data-slot="sheet-content"
                className={cn(
                    "fixed inset-y-0 z-50 flex h-dvh w-full max-w-sm flex-col gap-4 bg-background p-4 text-foreground shadow-lg outline-none duration-200 data-open:animate-in data-closed:animate-out motion-reduce:animate-none",
                    side === "left" ? "left-0 border-r data-open:slide-in-from-left data-closed:slide-out-to-left" : "right-0 border-l data-open:slide-in-from-right data-closed:slide-out-to-right",
                    className,
                )}
                {...props}
            >
                {children}
                <SheetPrimitive.Close render={<Button variant="ghost" size="icon" className="absolute top-4 right-4 size-11 lg:top-3 lg:right-3 lg:size-10" />}>
                    <XIcon aria-hidden="true" />
                    <span className="sr-only">Close</span>
                </SheetPrimitive.Close>
            </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
    );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return <div data-slot="sheet-header" className={cn("flex shrink-0 flex-col gap-2 pr-12", className)} {...props} />;
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
    return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
    return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
