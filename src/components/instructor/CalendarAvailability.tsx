import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { availabilityError, dateInputValue } from "@/lib/instructor-availability";
import type { AvailabilityRange, AvailabilitySlot } from "@/lib/instructor-availability";
import { formatTime, fullDate, parseCalendarDate } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";
import { singaporeClock } from "@/lib/instructor/calendar-view";
import type { CalendarEventsForDate } from "@/lib/instructor/calendar-view";
import { toInstructorDataError } from "@/lib/instructor/errors";

export const availabilityStyle = "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";

export function AvailabilityCard({ slot, selected, compact = false, onSelect }: { slot: AvailabilitySlot; selected: boolean; compact?: boolean; onSelect: () => void }) {
    return (
        <Button variant="outline" onClick={onSelect} aria-pressed={selected} aria-label={`Available, ${fullDate(slot.date)}, ${formatTime(slot.startTime)} to ${formatTime(slot.endTime)}. View availability details`} className={cn("h-auto w-full min-w-0 flex-col items-start gap-2 border-dashed p-4 text-left whitespace-normal hover:bg-emerald-100 dark:hover:bg-emerald-900", availabilityStyle, selected && "ring-2 ring-emerald-500", compact && "gap-0 px-1.5 py-1 text-3xs")}>
            <span className="flex max-w-full items-center gap-1.5 truncate font-medium"><CalendarCheck aria-hidden="true" className="size-3 shrink-0" />Available</span>
            <span className={cn("font-normal", !compact && "text-xs")}>
                {formatTime(slot.startTime)}{!compact && ` – ${formatTime(slot.endTime)}`}
            </span>
        </Button>
    );
}

export function AvailabilityDialog({ initial, editingId, slots, getEvents, onSave, onClose, onDelete, onReload, readOnly = false }: { initial: AvailabilityRange; editingId?: string; slots: AvailabilitySlot[]; getEvents: CalendarEventsForDate; onSave?: (range: AvailabilityRange) => Promise<void> | void; onClose: () => void; onDelete?: () => Promise<void> | void; onReload?: () => Promise<AvailabilityRange>; readOnly?: boolean }) {
    const [date, setDate] = useState(dateInputValue(initial.date));
    const [startTime, setStartTime] = useState(initial.startTime);
    const [endTime, setEndTime] = useState(initial.endTime);
    const [recorded, setRecorded] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState<"save" | "delete" | "reload" | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [reloadRequired, setReloadRequired] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [retry, setRetry] = useState<{ kind: "save" | "delete"; operation: () => Promise<void> | void } | null>(null);
    const busy = useRef(false);
    const active = useRef(true);
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const locked = readOnly || Boolean(pending) || Boolean(retry);

    async function perform(kind: "save" | "delete" | "reload", operation: () => Promise<void> | void) {
        if (busy.current) return;
        busy.current = true;
        setPending(kind);
        setError(null);
        setNotice(null);
        try {
            await operation();
            if (!active.current) return;
            setRetry(null);
            setReloadRequired(false);
            if (kind === "reload") setNotice("Saved record reloaded. Your draft is kept; review it before saving again.");
        } catch (failure) {
            if (!active.current) return;
            const error = toInstructorDataError(failure, "Unable to save availability. Please try again.");
            setError(error.message);
            if (kind !== "reload" && editingId && (error.code === "request_failed" || error.code === "invalid_data")) {
                setRetry({ kind, operation });
            }
            setReloadRequired(kind === "reload" || error.code === "conflict");
        } finally {
            busy.current = false;
            if (active.current) setPending(null);
        }
    }

    return (
        <Dialog open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}>
            <DialogContent showCloseButton={!pending} className="p-4 lg:p-6 [&_[data-slot=dialog-close]]:size-11 lg:[&_[data-slot=dialog-close]]:size-10 [&_[data-slot=dialog-close]_svg]:size-6">
                <form className="grid gap-5" aria-busy={Boolean(pending)} onSubmit={async (event) => {
                    event.preventDefault();
                    if (locked || busy.current || confirmDelete || !onSave) return;
                    const parsed = parseCalendarDate(date);
                    if (!parsed) { setError("Choose a valid date."); return; }
                    const range = { date: parsed, startTime, endTime };
                    const nextError = availabilityError(range, slots, editingId, singaporeClock(), getEvents(range.date).filter(item => item.status !== "cancelled"));
                    setError(nextError);
                    if (nextError) return;
                    await perform("save", () => onSave(range));
                }}>
                    <DialogHeader>
                        <DialogTitle className="pr-10">{readOnly ? "Availability" : confirmDelete ? "Delete availability?" : editingId ? "Edit availability" : "Add availability"}</DialogTitle>
                        <DialogDescription>{readOnly || confirmDelete ? "Your recorded availability · Singapore time." : "Choose a future time between 8 AM and 10 PM. Availability cannot overlap another slot or class."}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="availability-date">Date</Label>
                        <Input id="availability-date" type="date" required disabled={locked || confirmDelete} className="h-11 px-3 lg:h-10" min={dateInputValue(singaporeClock())} value={confirmDelete ? dateInputValue(recorded.date) : date} onChange={(event) => { setDate(event.target.value); setError(null); setNotice(null); }} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid min-w-0 gap-2"><Label htmlFor="availability-start">Start time</Label><Input id="availability-start" type="time" required disabled={locked || confirmDelete} className="h-11 px-3 lg:h-10" min="08:00" max="21:59" value={confirmDelete ? recorded.startTime : startTime} onChange={(event) => { setStartTime(event.target.value); setError(null); setNotice(null); }} /></div>
                        <div className="grid min-w-0 gap-2"><Label htmlFor="availability-end">End time</Label><Input id="availability-end" type="time" required disabled={locked || confirmDelete} className="h-11 px-3 lg:h-10" min="08:01" max="22:00" value={confirmDelete ? recorded.endTime : endTime} onChange={(event) => { setEndTime(event.target.value); setError(null); setNotice(null); }} /></div>
                    </div>
                    {confirmDelete && <p role="status" className="text-sm">Delete your recorded availability on {fullDate(recorded.date)}, {formatTime(recorded.startTime)} – {formatTime(recorded.endTime)}? This cannot be undone.</p>}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
                    {retry && <div className="grid gap-2">
                        <p className="text-sm text-muted-foreground">The result is unconfirmed. Retry the same change before editing further.</p>
                        <Button type="button" disabled={Boolean(pending)} className="h-11 px-4 lg:h-10" onClick={() => void perform(retry.kind, retry.operation)}>{pending ? "Confirming…" : retry.kind === "delete" ? "Retry delete" : "Retry save"}</Button>
                    </div>}
                    {reloadRequired && !retry && onReload && <Button type="button" variant="outline" disabled={Boolean(pending)} className="h-11 px-4 lg:h-10" onClick={() => void perform("reload", async () => {
                        const slot = await onReload();
                        if (active.current) setRecorded(slot);
                    })}>{pending === "reload" ? "Reloading…" : "Reload saved record"}</Button>}
                    <DialogFooter className="-mx-4 -mb-4 gap-3 p-4 lg:-mx-6 lg:-mb-6 lg:p-5">
                        {confirmDelete ? <>
                            <Button type="button" variant="outline" disabled={Boolean(pending) || Boolean(retry)} onClick={() => setConfirmDelete(false)} className="h-11 px-4 lg:h-10">Keep availability</Button>
                            <Button type="button" variant="destructive" disabled={locked || !onDelete} onClick={() => onDelete && void perform("delete", onDelete)} className="h-11 gap-2 px-4 lg:h-10"><Trash2 aria-hidden="true" />{pending === "delete" ? "Deleting…" : "Confirm delete"}</Button>
                        </> : <>
                            {editingId && <Button type="button" variant="destructive" disabled={locked || !onDelete} onClick={() => { setConfirmDelete(true); setError(null); setNotice(null); }} className="h-11 gap-2 px-4 sm:mr-auto lg:h-10"><Trash2 aria-hidden="true" />Delete</Button>}
                            <Button type="submit" disabled={locked || !onSave} className="h-11 px-4 lg:h-10">{pending === "save" ? "Saving…" : editingId ? "Save changes" : "Add availability"}</Button>
                        </>}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
