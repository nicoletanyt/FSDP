import { useEffect, useRef } from "react";
import type { CalendarDisplayMode, CalendarRange } from "@/components/shared/calendar/CalendarToolbar";

type Handlers = {
    /** Turns the shortcuts off, e.g. while a dialog of the page's own is open. */
    disabled?: boolean;
    /** Esc; return false when there is nothing to close. */
    onEscape?: () => boolean;
    /** D / W / M */
    onView: (view: CalendarRange) => void;
    /** T / L */
    onDisplayMode: (mode: CalendarDisplayMode) => void;
};

/** Calendar keyboard shortcuts shared by the instructor and admin calendars. */
export function useCalendarShortcuts(handlers: Handlers) {
    const latest = useRef(handlers);
    useEffect(() => {
        latest.current = handlers;
    });

    useEffect(() => {
        function handleCalendarShortcut(event: KeyboardEvent) {
            const { disabled, onEscape, onView, onDisplayMode } = latest.current;
            if (
                disabled || event.defaultPrevented || event.repeat || event.isComposing ||
                event.ctrlKey || event.metaKey || event.altKey
            ) return;
            const target = event.target;
            if (target instanceof HTMLElement && (
                target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [role="combobox"]')
            )) return;
            // Hidden overlays such as the closed chatbot stay mounted in the page.
            const hasOpenOverlay = Array.from(document.querySelectorAll<HTMLElement>(
                '[role="dialog"], [role="alertdialog"], [role="menu"]',
            )).some((overlay) => {
                if (overlay.closest('[hidden], [inert], [aria-hidden="true"], [data-closed]')) return false;
                const style = window.getComputedStyle(overlay);
                return overlay.getClientRects().length > 0 && style.visibility === "visible" && style.opacity !== "0";
            });
            if (hasOpenOverlay) return;

            const key = event.key.toLowerCase();
            const nextView = key === "w" ? "week" : key === "d" ? "day" : key === "m" ? "month" : null;
            if (key === "escape") {
                if (onEscape?.()) event.preventDefault();
            } else if (nextView) {
                event.preventDefault();
                onView(nextView);
            } else if (key === "t" || key === "l") {
                event.preventDefault();
                onDisplayMode(key === "t" ? "timeline" : "list");
            }
        }

        window.addEventListener("keydown", handleCalendarShortcut);
        return () => window.removeEventListener("keydown", handleCalendarShortcut);
    }, []);
}
