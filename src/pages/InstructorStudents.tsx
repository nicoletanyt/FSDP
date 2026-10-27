import { useSearchParams, Link } from 'react-router'
import { ChevronRight, Search, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { studentDetailsHref, students } from '@/lib/instructor-calendar'
import { beltColorClass, getStudentProfile } from '@/lib/instructor-student-details'
import { cn } from '@/lib/utils'

export default function InstructorStudents() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const today = new Date()
  const directory = students.map((student) => getStudentProfile(student, today))
  const filtered = directory.filter((student) =>
    `${student.name} ${student.studentNumber} ${student.beltGrade} ${student.principalDojo}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your student directory · Demo data</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search students by name, number, belt or dojo"
            placeholder="Search students, belts or dojos…"
            value={query}
            onChange={(event) => setParams((current) => {
              const next = new URLSearchParams(current)
              if (event.target.value) next.set('q', event.target.value)
              else next.delete('q')
              return next
            }, { replace: true })}
            className="h-10 bg-background pl-9"
          />
        </div>
        <p role="status" className="text-xs text-muted-foreground">{filtered.length} of {students.length} students</p>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0">
          {filtered.length ? (
            <ul className="divide-y" aria-label="Student directory">
              {filtered.map((student) => (
                <li key={student.id}>
                  <Link to={studentDetailsHref(student.id)} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:px-6">
                    <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-full border', beltColorClass(student.beltGrade))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{student.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{student.studentNumber} · {student.beltGrade}</p>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">{student.principalDojo}</p>
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:block">{student.principalDojo}</span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 px-6 py-12 text-center">
              <Users aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
              <h2 className="font-medium">No students found</h2>
              <p className="text-sm text-muted-foreground">Try another name, belt or dojo.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
