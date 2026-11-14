import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogFooter, AlertDialogHeader,
    AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useFeedback } from "@/hooks/use-feedback";
import { supabase } from "@/lib/supabase";

type RequestStatus = { id: string };

export default function ClassUnavailableDialog({ eventId }: { eventId: string }) {
    const { session } = useAuth();
    const [open, setOpen] = useState(false);
    const { notify, feedbackDialog } = useFeedback();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState<RequestStatus | null>(null);
    const status = useQuery({
        queryKey: ['instructor', session?.user.id, 'class-unavailability', eventId],
        enabled: Boolean(session), retry: false,
        queryFn: async (): Promise<RequestStatus | null> => {
            const { data, error: failure } = await supabase.from('instructor_class_unavailability')
                .select('id').eq('event_id', eventId).maybeSingle();
            if (failure) throw failure;
            return data as RequestStatus | null;
        },
    });
    const existing = saved ?? status.data;

    async function submit() {
        if (pending || existing || status.isError || status.isPending) return;
        setPending(true);
        setError('');
        try {
            const { data, error: failure } = await supabase.functions.invoke<{ request_id: string }>('report-class-unavailability', {
                body: { event_id: eventId },
            });
            if (failure) {
                const response = 'context' in failure && failure.context instanceof Response ? failure.context : null;
                const details = await response?.json().catch(() => null);
                throw new Error(typeof details?.error === 'string' ? details.error : 'Unable to save the request. Try again.');
            }
            if (!data?.request_id) throw new Error('Unable to confirm the request. Refresh to check its status.');
            setSaved({ id: data.request_id });
            setOpen(false);
            notify({ title: 'Unavailability reported', description: 'The administrators have been told you cannot take this class.' });
            void status.refetch();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to save the request. Try again.');
            void status.refetch();
        } finally {
            setPending(false);
        }
    }

    return <div className="space-y-2">
        {existing ? <p role="status" className="text-sm text-muted-foreground">Unavailability reported for this class.</p> : <AlertDialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(''); } }}>
            <AlertDialogTrigger render={<Button variant="destructive" className="min-h-11 w-full" disabled={status.isPending || status.isError} />}>
                I’m unavailable
            </AlertDialogTrigger>
            <AlertDialogContent size="compact">
                <AlertDialogHeader className="flex flex-row items-center justify-start gap-3 text-left">
                    <AlertDialogMedia className="mb-0 shrink-0 bg-destructive/10 text-destructive"><CircleAlert aria-hidden="true" /></AlertDialogMedia>
                    <AlertDialogTitle className="translate-y-1">Report unavailable for this class?</AlertDialogTitle>
                </AlertDialogHeader>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <AlertDialogFooter>
                    <AlertDialogCancel className="min-h-11" disabled={pending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void submit()} className="min-h-11">
                        {pending ? 'Saving…' : 'Confirm unavailability'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>}
        {status.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            Unable to check this class’s request status. <Button size="sm" variant="outline" onClick={() => void status.refetch()}>Retry</Button>
        </div>}
        {feedbackDialog}
    </div>;
}
