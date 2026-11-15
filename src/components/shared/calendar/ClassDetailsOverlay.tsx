import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

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
    return <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DrawerContent finalFocus={finalFocus}>
            <DrawerHeader>
                <div className="min-w-0">
                    <DrawerTitle className="text-base font-medium">{title}</DrawerTitle>
                    {description && <DrawerDescription className="text-xs text-muted-foreground">{description}</DrawerDescription>}
                </div>
                <DrawerClose render={<Button variant="ghost" className="h-11 rounded-full px-3 text-sm text-primary" />}>Done</DrawerClose>
            </DrawerHeader>
            <DrawerBody className="pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</DrawerBody>
        </DrawerContent>
    </Drawer>;
}
