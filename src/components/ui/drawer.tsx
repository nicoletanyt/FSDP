import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";

// Shadcn-style slots, using the same Base UI focus/modal APIs as our dialogs.
function Drawer(props: DrawerPrimitive.Root.Props) {
    return <DrawerPrimitive.Root swipeDirection="down" {...props} />;
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
    return <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-250 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DrawerPrimitive.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
            <DrawerPrimitive.Popup data-slot="drawer-content" className={cn(
                "flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top))] w-full max-w-2xl flex-col rounded-t-3xl bg-background text-foreground shadow-xl outline-none [transform:translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-250 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:transition-none motion-reduce:transition-none",
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
