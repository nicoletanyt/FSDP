import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { studentPhotoUrl } from "@/lib/student-photo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// The student's profile photo (private bucket, signed at read time) when they
// have one; otherwise their initials. Pass `studentId` to look the photo up, or
// `src` to use an image you already have.
function useStudentPhoto(studentId?: string) {
    const photo = useQuery({
        queryKey: ["student-photo", studentId],
        enabled: Boolean(studentId),
        // Signed links last an hour; refresh well before they expire.
        staleTime: 30 * 60_000,
        queryFn: async ({ signal }) => {
            const { data, error } = await supabase.from("students").select("photo_path")
                .eq("id", studentId!).abortSignal(signal).maybeSingle<{ photo_path: string | null }>();
            if (error) throw error;
            return studentPhotoUrl(data?.photo_path ?? null);
        },
    });
    return photo.data ?? null;
}

export default function StudentAvatar({ name, src, studentId, className }: { name: string; src?: string | null; studentId?: string; className?: string }) {
    const photo = useStudentPhoto(studentId);
    src = src ?? photo;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : parts[0]?.[0] ?? "?").toUpperCase();
    return (
        <Avatar className={cn("size-16", className)} data-student-avatar>
            {src && <AvatarImage src={src} alt="" />}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary" aria-hidden="true">{initials}</AvatarFallback>
        </Avatar>
    );
}
