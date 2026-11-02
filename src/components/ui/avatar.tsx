import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { useSyncExternalStore } from "react"
import type { InstructorProfile } from "@/lib/instructor-calendar"
import { getInstructorPhoto, subscribeInstructorPhotos } from "@/lib/instructor-calendar"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function Avatar({ className, ...props }: AvatarPrimitive.Root.Props) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} {...props} />
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={cn("flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground", className)} {...props} />
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return <AvatarPrimitive.Image data-slot="avatar-image" className={cn("size-full object-cover", className)} {...props} />
}

function useInstructorPhoto(instructorId: string | null | undefined) {
  return useSyncExternalStore(subscribeInstructorPhotos, () => getInstructorPhoto(instructorId), () => null)
}

function InstructorAvatar({ profile, showName = true, interactive = true, className, avatarClassName, fallbackClassName }: {
  profile: InstructorProfile
  showName?: boolean
  interactive?: boolean
  className?: string
  avatarClassName?: string
  fallbackClassName?: string
}) {
  const localPhoto = useInstructorPhoto(profile.id)
  const photo = localPhoto ?? profile.avatarUrl
  const parts = profile.name.trim().split(/\s+/).filter(Boolean)
  const initials = (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : parts[0]?.[0] ?? "?").toUpperCase()
  const content = <>
    <Avatar className={cn("size-6", avatarClassName)}>
      {photo && <AvatarImage src={photo} alt="" />}
      <AvatarFallback className={cn("text-[10px]", fallbackClassName)}>{initials}</AvatarFallback>
    </Avatar>
    {showName && <span className={cn("min-w-0 truncate text-sm font-medium", interactive && "underline-offset-4 group-hover/instructor:underline")}>{profile.name}</span>}
  </>

  if (!interactive) {
    return <span data-instructor-id={profile.id} className={cn("inline-flex min-w-0 max-w-full items-center gap-2 text-foreground", className)}>{content}</span>
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-instructor-id={profile.id}
        aria-label={`View instructor profile: ${profile.name}`}
        className={cn("group/instructor inline-flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-md text-left text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50", className)}
      >
        {content}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            {photo && <AvatarImage src={photo} alt={`${profile.name}'s profile photo`} />}
            <AvatarFallback className="text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <PopoverTitle className="break-words text-sm">{profile.name}</PopoverTitle>
            <p className="text-xs text-muted-foreground">{profile.role}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { Avatar, AvatarImage, AvatarFallback, InstructorAvatar, useInstructorPhoto }
