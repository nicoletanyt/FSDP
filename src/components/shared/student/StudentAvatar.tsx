import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Students have no stored photo yet, so this shows their initials; pass `src`
// once a photo is available and it is used instead.
export default function StudentAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : parts[0]?.[0] ?? "?").toUpperCase();
    return (
        <Avatar className={cn("size-16", className)} data-student-avatar>
            {src && <AvatarImage src={src} alt="" />}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary" aria-hidden="true">{initials}</AvatarFallback>
        </Avatar>
    );
}
