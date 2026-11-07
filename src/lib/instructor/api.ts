import type { SupabaseClient } from '@supabase/supabase-js'
import { parseEntityId, parseInstructorRow, resolveInstructorIdentity, timestampMilliseconds } from './adapters'
import {
  assertAssessment, dateOnly, decodeApplication, decodeAvailability, decodeCalendarEntry, nullable, object,
  decodeCentre, decodeClassType, decodeDirectory, decodeGrade, decodeGradeRequirement, decodeGradeTrack,
  decodeHistoryEntry, decodePage, decodeRosterEntry, decodeStudentDetail,
  decodeSummary, decodeSyllabusItem, decodeTechniqueSignOff, array, decodeAttendanceSave, decodeAttendanceSnapshot,
  decodeSessionSave, decodeAssessmentSnapshot,
} from './decoders'
import { InstructorDataError, toInstructorDataError } from './errors'
import { collectCalendarPages } from './page-collector'
import type {
  AssessmentDetail, AssessmentKey, AttendanceSaveInput, AvailabilityInput, CalendarOptions, DirectoryOptions, EventId, HistoryOptions,
  InstructorIdentity, InstructorReferenceData, Page, PageOptions, StudentId, AssessmentSaveInput, SessionSaveInput,
} from './types'

// Inject the existing shared Supabase client at the provider boundary. This does
// not create another auth session or require browser env configuration in tests.
type InstructorClient = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>

type TableResponse = { data: unknown[] | null; error: unknown; count: number | null }

const calendarSelect = '*, centre:centres(*), class:classes(*, class_type:class_types(*)), grading:gradings(*, target_grades:grading_target_grades(grade:grades(*))), seminar:seminars(*), workshop:workshops(*), participants:event_students(count)'
const studentSelect = '*, grade:grades(*), centre:centres(*)'
const rosterSelect = `*, student:students(${studentSelect})`

function invalidRequest(message: string): never {
  throw new InstructorDataError('invalid_request', message)
}

function pagination(options: PageOptions = {}) {
  const { limit = 50, offset = 0, signal } = options
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0
      || offset > 2_147_483_647 - limit) invalidRequest('Use a page size of 1–100 and a valid non-negative offset.')
  return { limit, offset, signal }
}

function cancellable<Query extends { abortSignal(signal: AbortSignal): unknown }>(query: Query, signal?: AbortSignal): Query {
  if (signal) query.abortSignal(signal)
  return query
}

function dateRange(from: string, to: string, timestamp: boolean) {
  const start = timestamp ? timestampMilliseconds(from) : Date.parse(`${dateOnly(from)}T00:00:00Z`)
  const end = timestamp ? timestampMilliseconds(to) : Date.parse(`${dateOnly(to)}T00:00:00Z`)
  if (end <= start || end - start > 62 * 86_400_000) invalidRequest('Choose a date range greater than zero and no longer than 62 days.')
}

export async function requestInstructorData<T>(
  operation: () => PromiseLike<{ data: T | null; error: unknown }>,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    signal?.throwIfAborted()
    const { data, error } = await operation()
    signal?.throwIfAborted()
    if (error) throw error
    return data
  } catch (error) {
    throw toInstructorDataError(error, errorMessage)
  }
}

export function createInstructorApi(client: InstructorClient) {
  async function getInstructorAccount(signal?: AbortSignal) {
    try {
      signal?.throwIfAborted()
      const { data: { user }, error } = await client.auth.getUser()
      if (error) throw error
      if (!user) throw new InstructorDataError('unauthenticated', 'Sign in to access instructor records.')

      const userId = parseEntityId(user.id, 'auth-user')
      const profile = await requestInstructorData(
        () => cancellable(client.from('users').select('id, role').eq('id', userId), signal)
          .maybeSingle<{ id: string; role: string }>(),
        'Unable to verify instructor permissions. Please try again.', signal,
      )
      if (profile?.id !== userId || profile.role !== 'instructor') {
        throw new InstructorDataError('forbidden', 'Instructor access is required.')
      }
      return { userId }
    } catch (error) {
      throw toInstructorDataError(error, 'Unable to verify your instructor account. Please try again.')
    }
  }

  async function findCurrentInstructor(signal?: AbortSignal): Promise<InstructorIdentity | null> {
    try {
      const { userId } = await getInstructorAccount(signal)
      const record = await requestInstructorData(
        () => cancellable(client.from('instructors')
          .select('id, user_id, first_name, last_name, email, created_at, updated_at')
          .eq('user_id', userId), signal).maybeSingle<unknown>(),
        'Unable to load your instructor record. Please try again.', signal,
      )
      // Never equate auth.users.id with instructors.id or match by email/name.
      return record === null ? null : resolveInstructorIdentity(userId, parseInstructorRow(record))
    } catch (error) {
      throw toInstructorDataError(error, 'Unable to load your instructor account. Please try again.')
    }
  }

  async function getCurrentInstructor(signal?: AbortSignal): Promise<InstructorIdentity> {
    const identity = await findCurrentInstructor(signal)
    if (!identity) throw new InstructorDataError('instructor_not_found', 'No instructor record is linked to your account.')
    return identity
  }

  async function tablePage<T>(query: PromiseLike<TableResponse>, decode: (value: unknown) => T, options: PageOptions): Promise<Page<T>> {
    const page = pagination(options)
    const response = await requestInstructorData(
      () => query.then(result => ({ data: { items: result.data, total: result.count, offset: page.offset, limit: page.limit }, error: result.error })),
      'Unable to load instructor records. Please try again.', page.signal,
    )
    return decodePage(response, decode)
  }

  async function allRows<T>(table: string, order: string[], decode: (value: unknown) => T, signal?: AbortSignal, select = '*', filters: Record<string, string> = {}): Promise<T[]> {
    const result: T[] = []
    let total: number
    do {
      const query = client.from(table).select(select, { count: 'exact' })
      for (const [column, value] of Object.entries(filters)) query.eq(column, value)
      for (const column of order) query.order(column)
      const page = await tablePage(cancellable(query.range(result.length, result.length + 99).returns<unknown[]>(), signal), decode,
        { limit: 100, offset: result.length, signal })
      total = page.total
      if (!page.items.length && result.length < total) {
        throw new InstructorDataError('invalid_data', 'The instructor records changed while loading. Please retry.')
      }
      result.push(...page.items)
    } while (result.length < total)
    return result
  }

  async function rpc(name: string, parameters: Record<string, unknown>, signal?: AbortSignal,
    errorMessage = 'Unable to load instructor records. Please try again.') {
    const data = await requestInstructorData(
      () => cancellable(client.rpc(name, parameters).returns<unknown>(), signal),
      errorMessage, signal,
    )
    if (data === null) throw new InstructorDataError('invalid_data', 'The instructor data response is missing.')
    return data
  }

  async function getEventForInstructor(id: EventId, identity: InstructorIdentity, signal?: AbortSignal) {
    const data = await requestInstructorData(
      () => cancellable(client.from('events').select(calendarSelect).eq('id', id)
        .eq('instructor_id', identity.instructorId), signal).maybeSingle<unknown>(),
      'Unable to load the class session. Please try again.', signal,
    )
    if (data === null) return null
    const session = decodeCalendarEntry(data)
    if (session.event.id !== id || session.event.instructor_id !== identity.instructorId) {
      throw new InstructorDataError('invalid_data', 'The session does not match the current instructor.')
    }
    return session
  }

  async function getRosterPage(eventId: EventId, options: PageOptions) {
    const page = pagination(options)
    return tablePage(cancellable(client.from('event_students').select(rosterSelect, { count: 'exact' })
      .eq('event_id', eventId).order('student_id').range(page.offset, page.offset + page.limit - 1).returns<unknown[]>(), page.signal),
    value => {
      const entry = decodeRosterEntry(value)
      if (entry.record.event_id !== eventId) throw new InstructorDataError('invalid_data', 'The roster does not match the session.')
      return entry
    }, page)
  }

  async function getStudentHistory(id: StudentId, options: HistoryOptions = {}) {
    const studentId = parseEntityId(id, 'student')
    const page = pagination(options)
    if (options.eventType !== undefined && !['class', 'seminar', 'workshop', 'grading'].includes(options.eventType)) invalidRequest('Choose a valid event type.')
    if (options.attendance !== undefined && !['present', 'late', 'absent', 'excused', 'unmarked'].includes(options.attendance)) invalidRequest('Choose a valid attendance filter.')
    for (const value of [options.oldestFirst, options.recordedAssessmentsOnly]) {
      if (value !== undefined && typeof value !== 'boolean') invalidRequest('Choose valid history filters.')
    }
    await getInstructorAccount(page.signal)
    const data = await rpc('instructor_student_history', {
      target_student: studentId, page_size: page.limit, page_offset: page.offset,
      filter_type: options.eventType ?? null,
      filter_attendance: options.attendance === 'unmarked' ? null : options.attendance ?? null,
      unmarked_only: options.attendance === 'unmarked', oldest_first: options.oldestFirst ?? false,
      recorded_assessments_only: options.recordedAssessmentsOnly ?? false,
    }, page.signal)
    const result = decodePage(data, decodeHistoryEntry)
    if (result.items.some(item => item.record.student_id !== studentId
        || (options.recordedAssessmentsOnly && (item.event.event_type !== 'grading' || item.record.assessment_status === null)))) {
      throw new InstructorDataError('invalid_data', 'The session history does not match the student.')
    }
    return result
  }

  async function saveSessionRecord(input: SessionSaveInput) {
    const requestId = parseEntityId(input.requestId, 'session-request')
    const eventId = parseEntityId(input.eventId, 'event')
    const studentId = parseEntityId(input.studentId, 'student')
    const expectedUser = parseEntityId(input.expectedUserId, 'auth-user')
    const expected = decodeAssessmentSnapshot(input.expected)
    const value = decodeAssessmentSnapshot({ status: input.status, notes: input.notes === null ? null : typeof input.notes === 'string' ? input.notes.trim() || null : invalidRequest('Enter valid assessment notes.') })
    const identity = await getCurrentInstructor()
    if (identity.userId !== expectedUser) throw new InstructorDataError('forbidden', 'Your account changed. Reopen this record before saving.')
    const result = decodeSessionSave(await rpc('save_instructor_session_record', {
      request_id: requestId, expected_user: expectedUser, target_event: eventId, target_student: studentId,
      write_kind: input.kind, expected_record: expected, new_value: value,
    }, undefined, 'Unable to save this record. Please retry.'))
    if (result.requestId !== requestId || result.eventId !== eventId || result.studentId !== studentId || result.kind !== input.kind
        || result.value.status !== value.status || result.value.notes !== value.notes) {
      throw new InstructorDataError('invalid_data', 'The saved record response does not match this request. Reload the saved record.')
    }
    return result
  }

  return {
    getCurrentInstructor,

    saveAssessment(input: AssessmentSaveInput) { return saveSessionRecord({ ...input, kind: 'assessment' }) },

    async saveAttendance(input: AttendanceSaveInput) {
      const requestId = parseEntityId(input.requestId, 'attendance-request')
      const eventId = parseEntityId(input.eventId, 'event')
      const expectedUser = parseEntityId(input.expectedUserId, 'auth-user')
      const expected = array(input.expected, decodeAttendanceSnapshot)
      if (!['student', 'roster'].includes(input.scope) || !['present', 'absent', 'unmarked'].includes(input.status)
          || !expected.length || (input.scope === 'student' && expected.length !== 1)
          || new Set(expected.map(item => item.studentId)).size !== expected.length) {
        invalidRequest('Choose a valid attendance action and complete roster snapshot.')
      }
      const account = await getInstructorAccount()
      if (account.userId !== expectedUser) throw new InstructorDataError('forbidden', 'Your account changed. Reload the session before saving attendance.')
      const result = decodeAttendanceSave(await rpc('save_instructor_attendance', {
        request_id: requestId, expected_user: expectedUser, target_event: eventId, save_scope: input.scope,
        new_status: input.status === 'unmarked' ? null : input.status, expected_attendance: expected,
      }, undefined, 'Unable to save attendance. Please retry.'))
      if (result.requestId !== requestId || result.eventId !== eventId || result.attendance.length !== expected.length
          || result.attendance.some(item => !expected.some(before => before.studentId === item.studentId))) {
        throw new InstructorDataError('invalid_data', 'The attendance save response does not match the request. Reload the roster.')
      }
      return result
    },

    async getClassTypes(signal?: AbortSignal) {
      await getInstructorAccount(signal)
      return allRows('class_types', ['id'], decodeClassType, signal)
    },

    async getReferenceData(signal?: AbortSignal): Promise<InstructorReferenceData> {
      await getInstructorAccount(signal)
      const [centres, grades, gradeTracks, gradeRequirements, syllabusItems, classTypes] = await Promise.all([
        allRows('centres', ['name', 'id'], decodeCentre, signal),
        allRows('grades', ['sort_order', 'id'], decodeGrade, signal),
        allRows('grade_tracks', ['grade_id', 'track'], decodeGradeTrack, signal),
        allRows('grade_requirements', ['grade_id', 'track'], decodeGradeRequirement, signal),
        allRows('syllabus_items', ['grade_id', 'track', 'category', 'sort_order', 'id'], decodeSyllabusItem, signal),
        allRows('class_types', ['id'], decodeClassType, signal),
      ])
      return { centres, grades, gradeTracks, gradeRequirements, syllabusItems, classTypes }
    },

    async getCalendar(options: CalendarOptions) {
      const page = pagination(options)
      dateRange(options.from, options.to, true)
      const identity = await findCurrentInstructor(page.signal)
      if (!identity) return { items: [], total: 0, offset: page.offset, limit: page.limit }
      const result = decodePage(await rpc('instructor_calendar', {
        range_from: options.from, range_to: options.to, page_size: page.limit, page_offset: page.offset,
      }, page.signal), decodeCalendarEntry)
      if (result.offset !== page.offset || result.limit !== page.limit
          || result.items.some(item => item.event.instructor_id !== identity.instructorId)) {
        throw new InstructorDataError('invalid_data', 'The calendar response does not match the instructor or requested page.')
      }
      return result
    },

    async getEvent(id: EventId, signal?: AbortSignal) {
      const eventId = parseEntityId(id, 'event')
      const identity = await findCurrentInstructor(signal)
      return identity ? getEventForInstructor(eventId, identity, signal) : null
    },

    async getAvailability(options: PageOptions & { from: string; to: string }) {
      const page = pagination(options)
      dateRange(options.from, options.to, false)
      const identity = await findCurrentInstructor(page.signal)
      if (!identity) return { items: [], total: 0, offset: page.offset, limit: page.limit }
      return tablePage(cancellable(client.from('instructor_availability').select('*', { count: 'exact' })
        .eq('instructor_id', identity.instructorId).gte('date', options.from).lt('date', options.to)
        .order('date').order('start_time').order('id').range(page.offset, page.offset + page.limit - 1).returns<unknown[]>(), page.signal),
      decodeAvailability, page)
    },

    async createAvailability(input: AvailabilityInput) {
      dateOnly(input.date)
      const validTime = /^([01]\d|2[0-3]):[0-5]\d$/
      if (!validTime.test(input.startTime) || !validTime.test(input.endTime)
          || input.startTime < '08:00' || input.endTime > '22:00' || input.endTime <= input.startTime) {
        invalidRequest('Choose a valid availability between 8 AM and 10 PM, Singapore time.')
      }
      const account = await getInstructorAccount()
      return decodeAvailability(await rpc('create_instructor_availability', {
        expected_user: account.userId, slot_date: input.date, slot_start: input.startTime, slot_end: input.endTime,
      }, undefined, 'Unable to save your availability. Please try again.'))
    },

    async getStudents(options: DirectoryOptions = {}) {
      const page = pagination(options)
      const search = options.search ?? ''
      if (typeof search !== 'string' || search.length > 200) invalidRequest('Use a student search of at most 200 characters.')
      if (options.gradeId !== undefined && typeof options.gradeId !== 'string') invalidRequest('Choose a valid grade.')
      if (options.colour !== undefined && typeof options.colour !== 'string') invalidRequest('Choose a valid belt colour.')
      const centre = options.centreId === undefined ? null : parseEntityId(options.centreId, 'centre')
      await getInstructorAccount(page.signal)
      const directory = decodeDirectory(await rpc('instructor_student_directory', {
        search_text: search, filter_grade: options.gradeId ?? null, filter_colour: options.colour ?? null,
        filter_centre: centre, page_size: page.limit, page_offset: page.offset,
      }, page.signal))
      if (directory.offset !== page.offset || directory.limit !== page.limit) {
        throw new InstructorDataError('invalid_data', 'The directory response does not match the requested page.')
      }
      return directory
    },

    async getStudentDetail(id: StudentId, signal?: AbortSignal) {
      const studentId = parseEntityId(id, 'student')
      await getInstructorAccount(signal)
      const data = await requestInstructorData(
        () => cancellable(client.from('students').select(`${studentSelect}, emergency_contacts(*), medical_alerts:student_medical_alerts(*)`)
          .eq('id', studentId), signal).maybeSingle<unknown>(),
        'Unable to load the student profile. Please try again.', signal,
      )
      const detail = data === null ? null : decodeStudentDetail(data)
      if (detail && detail.student.id !== studentId) throw new InstructorDataError('invalid_data', 'The student profile does not match.')
      return detail
    },

    async getRoster(id: EventId, options: PageOptions = {}) {
      const eventId = parseEntityId(id, 'event')
      const page = pagination(options)
      const session = await getEventForInstructor(eventId, await getCurrentInstructor(page.signal), page.signal)
      if (!session) return null
      return getRosterPage(eventId, page)
    },

    async getAttendanceRoster(id: EventId, signal: AbortSignal) {
      const eventId = parseEntityId(id, 'event')
      const session = await getEventForInstructor(eventId, await getCurrentInstructor(signal), signal)
      if (!session) throw new InstructorDataError('forbidden', 'This session is no longer assigned to your account.')
      const entries = await collectCalendarPages(options => getRosterPage(eventId, options), item => item.record.student_id, signal)
      return { session, entries }
    },

    getStudentHistory,

    getRecordedAssessments(id: StudentId, options: PageOptions = {}) {
      return getStudentHistory(id, { ...options, eventType: 'grading', recordedAssessmentsOnly: true })
    },

    async getStudentSummary(id: StudentId, signal?: AbortSignal) {
      const studentId = parseEntityId(id, 'student')
      await getInstructorAccount(signal)
      return decodeSummary(await rpc('instructor_student_summary', { target_student: studentId }, signal))
    },

    async getTechniqueSignOffs(id: StudentId, signal?: AbortSignal) {
      const studentId = parseEntityId(id, 'student')
      await getInstructorAccount(signal)
      const rows = await allRows('technique_sign_offs', ['signed_off_at', 'id'], decodeTechniqueSignOff, signal,
        '*, instructor:instructors(*)', { student_id: studentId })
      if (rows.some(item => item.signOff.student_id !== studentId)) throw new InstructorDataError('invalid_data', 'The technique sign-offs do not match the student.')
      return rows
    },

    async getAssessment(key: AssessmentKey, signal?: AbortSignal): Promise<AssessmentDetail | null> {
      const eventId = parseEntityId(key.eventId, 'event')
      const studentId = parseEntityId(key.studentId, 'student')
      const session = await getEventForInstructor(eventId, await getCurrentInstructor(signal), signal)
      if (!session || session.event.event_type !== 'grading') return null
      const value = await requestInstructorData(
        () => cancellable(client.from('event_students').select(rosterSelect).eq('event_id', eventId)
          .eq('student_id', studentId), signal).maybeSingle<unknown>(),
        'Unable to load the assessment. Please try again.', signal,
      )
      if (value === null) return null
      const roster = decodeRosterEntry(value)
      if (roster.record.student_id !== studentId) throw new InstructorDataError('invalid_data', 'The assessment does not match the student.')
      const application = await requestInstructorData(
        () => cancellable(client.from('grading_applications').select('*, target_grade:grades(*)').eq('grading_event_id', eventId)
          .eq('student_id', studentId), signal).maybeSingle<unknown>(),
        'Unable to load the assessment target grade. Please try again.', signal,
      )
      return assertAssessment({ ...roster, session, application: application === null ? null : decodeApplication(application),
        targetGrade: application === null ? null : nullable(decodeGrade)(object(application).target_grade) })
    },
  }
}
