import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SignaturePoint } from "@/lib/instructor-student-details";
import type { GradingSignature } from "@/lib/instructor/types";

function SignaturePad({ onChange, disabled }: { onChange: (value: GradingSignature | null) => void; disabled: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<SignaturePoint[][]>([]);
    const pointer = useRef<number | null>(null);
    const [count, setCount] = useState(0);
    const notify = () => onChange(strokes.current.length ? { version: 1, strokes: strokes.current.map(stroke => stroke.map(point => ({ ...point }))) } : null);

    function redraw() {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height) return;
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        context.clearRect(0, 0, width, height);
        context.strokeStyle = "#0f172a";
        context.fillStyle = "#0f172a";
        context.lineWidth = 2.5;
        context.lineCap = "round";
        context.lineJoin = "round";
        for (const stroke of strokes.current) {
            if (!stroke.length) continue;
            context.beginPath();
            context.arc(stroke[0].x * width, stroke[0].y * height, 1.25, 0, Math.PI * 2);
            context.fill();
            context.beginPath();
            context.moveTo(stroke[0].x * width, stroke[0].y * height);
            for (const point of stroke.slice(1)) context.lineTo(point.x * width, point.y * height);
            context.stroke();
        }
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const { width, height } = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(width * (window.devicePixelRatio || 1)));
            canvas.height = Math.max(1, Math.round(height * (window.devicePixelRatio || 1)));
            redraw();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        return () => observer.disconnect();
    }, []);

    function point(event: { clientX: number; clientY: number }): SignaturePoint {
        const bounds = canvasRef.current!.getBoundingClientRect();
        return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
    }
    function begin(event: PointerEvent<HTMLCanvasElement>) {
        if (disabled || !event.isPrimary || event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        strokes.current.push([point(event)]);
        setCount(strokes.current.length);
        redraw();
    }
    function move(event: PointerEvent<HTMLCanvasElement>) {
        if (disabled || event.pointerId !== pointer.current) return;
        event.preventDefault();
        const samples = event.nativeEvent.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event.nativeEvent]) strokes.current[strokes.current.length - 1].push(point(sample));
        redraw();
    }
    function finish(event: PointerEvent<HTMLCanvasElement>) {
        if (event.pointerId !== pointer.current) return;
        if (event.type === "pointerup") strokes.current[strokes.current.length - 1].push(point(event));
        pointer.current = null;
        notify();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        redraw();
    }

    return <div className="space-y-3">
        <p id="signature-help" className="text-sm text-muted-foreground">Sign using your mouse, finger or stylus.</p>
        <div className="relative overflow-hidden rounded-lg border bg-white">
            <canvas ref={canvasRef} role="img" aria-label="Examiner signature pad" aria-describedby="signature-help" className="block h-48 w-full touch-none cursor-crosshair select-none" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
            {!count && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">Sign here</span>}
        </div>
        <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={disabled || !count} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); notify(); }}>Undo</Button>
            <Button type="button" variant="outline" disabled={disabled || !count} onClick={() => { strokes.current = []; setCount(0); redraw(); notify(); }}>Clear</Button>
        </div>
    </div>;
}

export default function GradingSignatureDialog({ open, onOpenChange, name, pending, error, retrying, onSubmit }: {
    open: boolean; onOpenChange: (open: boolean) => void; name: string; pending: boolean; error: string; retrying: boolean;
    onSubmit: (signature: GradingSignature | null) => Promise<boolean>;
}) {
    const [signature, setSignature] = useState<GradingSignature | null>(null);
    useEffect(() => { if (!open) setSignature(null); }, [open]);
    return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
        <DialogContent showCloseButton={!pending}>
            <DialogHeader><DialogTitle>Sign and submit grading</DialogTitle><DialogDescription>Sign this version of your checklist. You can edit it later; updated submissions require a new signature. No final grades are assigned.</DialogDescription></DialogHeader>
            <div><p className="text-xs text-muted-foreground">Instructor</p><p className="mt-1 font-medium">{name}</p></div>
            <SignaturePad onChange={setSignature} disabled={pending || retrying} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button disabled={pending || (!signature && !retrying)} onClick={async () => { if (await onSubmit(signature)) onOpenChange(false); }}>
                    {pending ? "Submitting…" : retrying ? "Retry submission" : "Confirm and submit"}
                </Button>
            </div>
        </DialogContent>
    </Dialog>;
}
