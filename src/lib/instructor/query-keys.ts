// The authenticated user ID is required even for shared reference data.
// Filters must contain every value that changes the service response.
type QueryFilters = Readonly<Record<string, string | number | boolean | null | undefined>>

export const instructorQueryKeys = {
  all: (userId: string) => ['instructor', userId] as const,
  calendar: (userId: string, from: string, to: string) => [...instructorQueryKeys.all(userId), 'calendar', from, to] as const,
  availability: (userId: string, from: string, to: string) => [...instructorQueryKeys.all(userId), 'availability', from, to] as const,
  event: (userId: string, eventId: string) => [...instructorQueryKeys.all(userId), 'event', eventId] as const,
  roster: (userId: string, eventId: string) => [...instructorQueryKeys.all(userId), 'roster', eventId] as const,
  reportsAll: (userId: string) => [...instructorQueryKeys.all(userId), 'reports'] as const,
  reports: (userId: string, eventId: string) => [...instructorQueryKeys.reportsAll(userId), eventId] as const,
  report: (userId: string, eventId: string, studentId: string) => [...instructorQueryKeys.all(userId), 'report', eventId, studentId] as const,
  assessment: (userId: string, eventId: string, studentId: string) => [...instructorQueryKeys.all(userId), 'assessment', eventId, studentId] as const,
  assessmentRoute: (userId: string, assessmentId?: string, eventId?: string, studentId?: string) => [...instructorQueryKeys.all(userId), 'assessment-route', assessmentId ?? null, eventId ?? null, studentId ?? null] as const,
  students: (userId: string) => [...instructorQueryKeys.all(userId), 'students'] as const,
  directory: (userId: string) => [...instructorQueryKeys.all(userId), 'directory'] as const,
  studentContext: (userId: string, eventId: string) => [...instructorQueryKeys.all(userId), 'student-context', eventId] as const,
  student: (userId: string, studentId: string) => [...instructorQueryKeys.students(userId), studentId] as const,
  studentDetail: (userId: string, studentId: string) => [...instructorQueryKeys.student(userId, studentId), 'detail'] as const,
  studentHistory: (userId: string, studentId: string, filters: QueryFilters) => [...instructorQueryKeys.student(userId, studentId), 'history', filters] as const,
  studentSummary: (userId: string, studentId: string) => [...instructorQueryKeys.student(userId, studentId), 'summary'] as const,
  studentFeedback: (userId: string, studentId: string) => [...instructorQueryKeys.student(userId, studentId), 'feedback'] as const,
  studentGrading: (userId: string, studentId: string) => [...instructorQueryKeys.student(userId, studentId), 'grading'] as const,
  reference: (userId: string) => [...instructorQueryKeys.all(userId), 'reference'] as const,
  classTypes: (userId: string) => [...instructorQueryKeys.reference(userId), 'class-types'] as const,
  identity: (userId: string) => [...instructorQueryKeys.all(userId), 'identity'] as const,
}

export const instructorQueryTimes = {
  calendar: { staleTime: 2 * 60_000, gcTime: 15 * 60_000 },
  event: { staleTime: 2 * 60_000, gcTime: 15 * 60_000 },
  roster: { staleTime: 30_000, gcTime: 10 * 60_000 },
  report: { staleTime: 30_000, gcTime: 10 * 60_000 },
  assessment: { staleTime: 30_000, gcTime: 10 * 60_000 },
  student: { staleTime: 2 * 60_000, gcTime: 10 * 60_000 },
  studentHistory: { staleTime: 60_000, gcTime: 10 * 60_000 },
  studentGrading: { staleTime: 60_000, gcTime: 10 * 60_000 },
  availability: { staleTime: 60_000, gcTime: 10 * 60_000 },
  reference: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
  identity: { staleTime: 30_000, gcTime: 10 * 60_000 },
} as const
