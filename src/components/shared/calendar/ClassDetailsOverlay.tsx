import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

/**
 * The sheet's footer slot: content deep inside the sheet can portal its main
 * action here so it sits flush on the sheet's bottom edge, outside the scroll.
 * Null outside a sheet (or before the slot mounts), so callers render inline.
 */
const SheetFooterContext = createContext<HTMLElement | null>(null);
export const useSheetFooter = () => useContext(SheetFooterContext);

/**
 * Hides the sheet while something opened from inside it (such as the progress
 * checklist) is showing, and brings it back afterwards. Null outside a sheet.
 */
const SheetSuspendContext = createContext<((suspended: boolean) => void) | null>(null);
export const useSheetSuspend = () => useContext(SheetSuspendContext);

/**
 * Class/event details wherever the desktop side panel doesn't fit: the bottom
 * sheet, on phones and tablets alike.
 */
export default function ClassDetailsOverlay({ open, onClose, title, description, finalFocus, children }: {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: ReactNode;
    finalFocus?: () => HTMLElement | null;
    children: ReactNode;
}) {
    const [footer, setFooter] = useState<HTMLDivElement | null>(null);
    const [suspended, setSuspended] = useState(false);
    useEffect(() => { if (!open) setSuspended(false); }, [open]);
    return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DrawerContent finalFocus={finalFocus} suspended={suspended}>
            <DrawerHeader>
                <div className="min-w-0">
                    <DrawerTitle className="text-base font-medium">{title}</DrawerTitle>
                    {description && <DrawerDescription className="text-xs text-muted-foreground">{description}</DrawerDescription>}
                </div>
                <DrawerClose render={<Button variant="ghost" className="h-11 rounded-full px-3 text-sm text-primary" />}>Done</DrawerClose>
            </DrawerHeader>
            <SheetSuspendContext value={setSuspended}>
            <SheetFooterContext value={footer}>
                {/* With a footer bar, the bar covers the home-indicator area instead. */}
                <DrawerBody className="pb-[max(1rem,env(safe-area-inset-bottom))] [&:has(+[data-sheet-footer]:not(:empty))]:pb-4">{children}</DrawerBody>
            </SheetFooterContext>
            </SheetSuspendContext>
            {/* Hidden until something is portalled in. */}
            <div ref={setFooter} data-sheet-footer className="shrink-0 empty:hidden" />
        </DrawerContent>
    </Drawer>;
}
