import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";

// Shadcn-style slots, using the same Base UI focus/modal APIs as our dialogs.
function Drawer(props: DrawerPrimitive.Root.Props) {
    return <DrawerPrimitive.Root swipeDirection="down" {...props} />;
}

// `suspended` slides an open drawer out of view without closing it, e.g. while a
// dialog opened from inside it is showing; it slides back when cleared. The
// backdrop keeps the page dimmed meanwhile.
function DrawerContent({ className, children, suspended = false, ...props }: DrawerPrimitive.Popup.Props & { suspended?: boolean }) {
    return <DrawerPrimitive.Portal>
        {/* The backdrop stays while suspended, so the page remains dimmed behind the dialog. */}
        <DrawerPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-250 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DrawerPrimitive.Viewport className={cn("fixed inset-0 z-50 flex items-end justify-center", suspended && "pointer-events-none")}>
            <DrawerPrimitive.Popup data-slot="drawer-content" data-suspended={suspended || undefined} className={cn(
                "flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top))] w-full max-w-2xl flex-col rounded-t-3xl bg-background text-foreground shadow-xl outline-none transition-[transform,visibility] duration-250 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:transition-none motion-reduce:transition-none",
                suspended ? "invisible [transform:translateY(100%)]" : "[transform:translateY(var(--drawer-swipe-movement-y,0px))]",
                className,
            )} {...props}>
                <div aria-hidden="true" className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
                {children}
            </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>;
}

function DrawerHeader({ className, ...props }: ComponentProps<"div">) {
    return <div data-slot="drawer-header" className={cn("flex shrink-0 items-center justify-between gap-3 p-4 lg:py-3", className)} {...props} />;
}

function DrawerBody({ className, ...props }: DrawerPrimitive.Content.Props) {
    return <DrawerPrimitive.Content data-slot="drawer-body" className={cn("min-h-0 overflow-y-auto overscroll-contain p-4", className)} {...props} />;
}

const DrawerTitle = DrawerPrimitive.Title;
const DrawerDescription = DrawerPrimitive.Description;
const DrawerClose = DrawerPrimitive.Close;

export { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerTitle, DrawerDescription, DrawerClose };
