import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function DayClassDetails({ children, onClose }: { children: ReactNode; onClose: () => void }) {
    const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

    useEffect(() => {
        const media = window.matchMedia("(min-width: 1024px)");
        const update = () => setDesktop(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    if (desktop) {
        return (
            <aside aria-label="Calendar selection details" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                {children}
            </aside>
        );
    }

    return (
        <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent className="gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <SheetHeader>
                    <SheetTitle>Class details</SheetTitle>
                    <SheetDescription className="sr-only">Class information, student roster, and attendance actions.</SheetDescription>
                </SheetHeader>
                {children}
            </SheetContent>
        </Sheet>
    );
}
