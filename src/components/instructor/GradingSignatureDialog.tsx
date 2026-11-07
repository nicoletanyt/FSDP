import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SignaturePoint } from "@/lib/instructor-student-details";

function SignaturePad() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<SignaturePoint[][]>([]);
    const pointer = useRef<number | null>(null);
    const [count, setCount] = useState(0);

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
        if (!event.isPrimary || event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        strokes.current.push([point(event)]);
        setCount(strokes.current.length);
        redraw();
    }
    function move(event: PointerEvent<HTMLCanvasElement>) {
        if (event.pointerId !== pointer.current) return;
        event.preventDefault();
        const samples = event.nativeEvent.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event.nativeEvent]) strokes.current[strokes.current.length - 1].push(point(sample));
        redraw();
    }
    function finish(event: PointerEvent<HTMLCanvasElement>) {
        if (event.pointerId !== pointer.current) return;
        if (event.type === "pointerup") strokes.current[strokes.current.length - 1].push(point(event));
        pointer.current = null;
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
            <Button type="button" variant="outline" disabled={!count} onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); }}>Undo</Button>
            <Button type="button" variant="outline" disabled={!count} onClick={() => { strokes.current = []; setCount(0); redraw(); }}>Clear</Button>
        </div>
    </div>;
}

export default function GradingSignatureDialog({ open, onOpenChange, name }: { open: boolean; onOpenChange: (open: boolean) => void; name: string }) {
    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Sign grading</DialogTitle><DialogDescription>Review and sign as the assigned instructor.</DialogDescription></DialogHeader>
            <div><p className="text-xs text-muted-foreground">Instructor</p><p className="mt-1 font-medium">{name}</p></div>
            <SignaturePad />
            <p role="status" className="text-sm text-muted-foreground">Saving is not available yet. The grading and signature will not be saved.</p>
            <div className="flex justify-end"><Button disabled className="bg-emerald-700 text-white">Confirm and save</Button></div>
        </DialogContent>
    </Dialog>;
}
