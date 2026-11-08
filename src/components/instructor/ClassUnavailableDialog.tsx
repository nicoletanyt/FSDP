import { useId } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function ClassUnavailableDialog({ eventName }: { eventName: string }) {
    const helpId = useId();
    return (
        <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" className="min-h-11 w-full" />}>
                I’m unavailable
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive">
                        <CircleAlert aria-hidden="true" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Once your absence is marked, an email will be sent out to notify other instructors and the admin.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <p className="font-medium wrap-break-word">{eventName}</p>
                <p id={helpId} className="text-sm text-muted-foreground">
                    Absence marking is not available yet. No absence will be saved and no email will be sent.
                </p>
                <AlertDialogFooter>
                    <AlertDialogCancel className="min-h-11">
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled aria-describedby={helpId} className="min-h-11">
                        Confirm absence
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
