import { Clock3, MapPin, UserRound, UsersRound, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ClassOffering } from '@/lib/student-schedule'
import { formatTime, prettyDate } from '@/lib/student-schedule'

export default function ClassCard({ item, recommended, booked, onEnroll }: { item: ClassOffering; recommended: boolean; booked: boolean; onEnroll: () => void }) {
  const available = Math.max(0, item.capacity - item.occupied - (booked ? 1 : 0))
  return <Card className="gap-3 py-4">
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{prettyDate(item.date)}</span>{recommended && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"><Sparkles className="size-3" /> Recommended for your rank</span>}</div>
      <CardTitle className="text-lg">{item.title}</CardTitle>
      <p className="text-xs text-muted-foreground">{item.level}</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><span className="flex items-center gap-2"><Clock3 className="size-4" />{formatTime(item.startTime)} – {formatTime(item.endTime)}</span><span className="flex items-center gap-2"><MapPin className="size-4" />{item.centre}</span><span className="flex items-center gap-2"><UserRound className="size-4" />{item.instructor}</span><span className="flex items-center gap-2"><UsersRound className="size-4" />{available} of {item.capacity} slots available</span></div>
      <Button className="w-full" disabled={booked || available === 0} onClick={onEnroll}>{booked ? 'Enrolled' : available === 0 ? 'Fully booked' : 'Enroll'}</Button>
    </CardContent>
  </Card>
}