import { useState } from "react";
import { CalendarCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { availabilityError, dateInputValue } from "@/lib/instructor-availability";
import type { AvailabilityRange, AvailabilitySlot } from "@/lib/instructor-availability";
import { formatTime, fullDate, parseCalendarDate } from "@/lib/instructor-calendar";
import { cn } from "@/lib/utils";

export const availabilityStyle = "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";

export function AvailabilityCard({ slot, selected, compact = false, onSelect }: { slot: AvailabilitySlot; selected: boolean; compact?: boolean; onSelect: () => void }) {
    return (
        <Button variant="outline" onClick={onSelect} aria-pressed={selected} aria-label={`Available, ${fullDate(slot.date)}, ${formatTime(slot.startTime)} to ${formatTime(slot.endTime)}. View availability details`} className={cn("h-auto w-full min-w-0 flex-col items-start gap-2 border-dashed p-4 text-left whitespace-normal hover:bg-emerald-100 dark:hover:bg-emerald-900", availabilityStyle, selected && "ring-2 ring-emerald-500", compact && "gap-0 px-1.5 py-1 text-[11px]")}>
            <span className="flex max-w-full items-center gap-1.5 truncate font-medium"><CalendarCheck aria-hidden="true" className="size-3 shrink-0" />Available</span>
            <span className={cn("font-normal", !compact && "text-xs")}>
                {formatTime(slot.startTime)}{!compact && ` – ${formatTime(slot.endTime)}`}
            </span>
        </Button>
    );
}

export function AvailabilityDialog({ initial, editingId, slots, onSave, onClose, onDelete, readOnly = false }: { initial: AvailabilityRange; editingId?: string; slots: AvailabilitySlot[]; onSave?: (range: AvailabilityRange) => void; onClose: () => void; onDelete?: () => void; readOnly?: boolean }) {
    const [date, setDate] = useState(dateInputValue(initial.date));
    const [startTime, setStartTime] = useState(initial.startTime);
    const [endTime, setEndTime] = useState(initial.endTime);
    const [error, setError] = useState<string | null>(null);
    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="p-4 sm:max-w-md lg:p-6 [&_[data-slot=dialog-close]]:size-11 lg:[&_[data-slot=dialog-close]]:size-10 [&_[data-slot=dialog-close]_svg]:size-6">
                <form className="grid gap-5" onSubmit={(event) => {
                    event.preventDefault();
                    if (readOnly) return;
                    const parsed = parseCalendarDate(date);
                    if (!parsed) { setError("Choose a valid date."); return; }
                    const range = { date: parsed, startTime, endTime };
                    const nextError = availabilityError(range, slots, editingId);
                    setError(nextError);
                    if (!nextError) onSave?.(range);
                }}>
                    <DialogHeader>
                        <DialogTitle className="pr-10">{readOnly ? "Availability" : editingId ? "Edit availability" : "Add availability"}</DialogTitle>
                        <DialogDescription>{readOnly ? "Your recorded availability · Singapore time." : "Choose a future time between 8 AM and 10 PM. Availability cannot overlap another slot or class."}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="availability-date">Date</Label>
                        <Input id="availability-date" type="date" required disabled={readOnly} className="h-11 px-3 lg:h-10" min={dateInputValue(new Date())} value={date} onChange={(event) => { setDate(event.target.value); setError(null); }} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid min-w-0 gap-2"><Label htmlFor="availability-start">Start time</Label><Input id="availability-start" type="time" required disabled={readOnly} className="h-11 px-3 lg:h-10" min="08:00" max="21:59" value={startTime} onChange={(event) => { setStartTime(event.target.value); setError(null); }} /></div>
                        <div className="grid min-w-0 gap-2"><Label htmlFor="availability-end">End time</Label><Input id="availability-end" type="time" required disabled={readOnly} className="h-11 px-3 lg:h-10" min="08:01" max="22:00" value={endTime} onChange={(event) => { setEndTime(event.target.value); setError(null); }} /></div>
                    </div>
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                    <DialogFooter className="-mx-4 -mb-4 gap-3 p-4 lg:-mx-6 lg:-mb-6 lg:p-5">
                        {editingId && <Button type="button" variant="destructive" disabled={readOnly} onClick={onDelete} className="h-11 gap-2 px-4 sm:mr-auto lg:h-10"><Trash2 aria-hidden="true" />Delete</Button>}
                        <Button type="submit" disabled={readOnly} className="h-11 px-4 lg:h-10">{editingId ? "Save changes" : "Add availability"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
