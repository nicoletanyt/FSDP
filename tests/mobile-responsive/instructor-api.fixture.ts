// Test-only read provider. Production calendar code never imports these records.
import { addDays, classTemplates, classTypes, dateKey, dojoCapacities, eventsForDate, parseCalendarDate, students } from '../../src/lib/instructor-calendar'
import { getGrade, belts } from '../../src/lib/student-grades'
import { mockAvailability, dateInputValue } from '../../src/lib/instructor-availability'
import { toSingaporeDateTime } from '../../src/lib/instructor/adapters'
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import { collectCalendarPages } from '../../src/lib/instructor/calendar-queries'
import type { CalendarEntry, CentreRow, EventId, Page, PageOptions, RosterEntry, StudentId, InstructorId, InstructorAvailabilityRow } from '../../src/lib/instructor/types'
import { createDirectoryFixtureReader } from './instructor-directory.fixture'
import { createDetailFixtureReads } from './instructor-detail.fixture'
import { createGradingFixtureReads } from './instructor-grading.fixture'
import { createGradingBatchFixture } from './instructor-grading-batches.fixture'
import { createSessionFixtureReads } from './instructor-session.fixture'
import { createSessionWriteFixture } from './instructor-session-writes.fixture'
import { attendanceEditable, attendanceSnapshot, editableAttendanceRows } from '../../src/lib/instructor/attendance'
import type { AttendanceSaveInput, AttendanceSaveResult, AvailabilitySaveInput, AvailabilitySaveResult, EventStudentRow } from '../../src/lib/instructor/types'
import type { InstructorProfileDetails } from '../../src/lib/instructor/profile'

declare global {
  interface Window { attendanceRequestsFixture: AttendanceSaveInput[]; profileWriteRequestsFixture: string[]; availabilityReadsFixture: number; availabilityWritesFixture: number; availabilityRequestsFixture: AvailabilitySaveInput[] }
}

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const instructorId = uuid(1) as InstructorId
const metadata = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const today = new Date(2026, 10, 3)
const catalogue = Object.entries(classTypes).map(([id, entry]) => ({ id, label: entry.label, description: entry.description }))

function centre(name: string): CentreRow {
  return { id: uuid(name === 'Central Dojo' ? 10 : 11) as CentreRow['id'], name, short_name: name,
    address: '', timezone: 'Asia/Singapore', status: 'active', capacity: dojoCapacities[name] ?? null, ...metadata }
}

function eventId(template: string, date: Date): EventId {
  return `00000000-0000-4000-8000-${dateInputValue(date).replaceAll('-', '')}${String(classTemplates.findIndex(item => item.id === template) + 1).padStart(4, '0')}` as EventId
}

function entry(templateId: string, date: Date): CalendarEntry | null {
  const source = eventsForDate(date).find(item => item.id === `${templateId}-${dateKey(date)}`)
  if (!source) return null
  const id = eventId(templateId, date)
  const dojo = centre(source.dojo)
  return {
    event: { id, name: source.name, event_type: source.type === 'grading' ? 'grading' : 'class',
      centre_id: dojo.id, instructor_id: instructorId, starts_at: `${dateInputValue(date)}T${source.startTime}:00+08:00`,
      ends_at: `${dateInputValue(date)}T${source.endTime}:00+08:00`, status: 'scheduled', ...metadata },
    centre: dojo, classType: catalogue.find(type => type.id === source.classType) ?? null,
    grading: source.type === 'grading' ? { event_id: id, track: null, application_deadline: null, application_status: 'closed',
      grading_date: null, application_opens_on: null, reporting_release_on: null, reporting_time: null, official_schedule: false } : null,
    targetGrades: [], gradeSessions: [], onPanel: false, seminar: null, workshop: null, rosterCount: source.studentIds.length,
  }
}

function findEvent(id: string) {
  const match = /^00000000-0000-4000-8000-(\d{4})(\d{2})(\d{2})(\d{4})$/.exec(id)
  if (!match) return null
  const date = parseCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)
  const template = classTemplates[Number(match[4]) - 1]
  return date && template ? entry(template.id, date) : null
}

function dateOnlyGrading(released: boolean): CalendarEntry {
  const id = uuid(8800) as EventId
  const dojo = centre('Central Dojo')
  return { event: { id, name: 'Official date-only grading', event_type: 'grading', centre_id: dojo.id, instructor_id: instructorId,
    starts_at: null, ends_at: null, status: 'scheduled', ...metadata }, centre: dojo, classType: null,
    grading: { event_id: id, track: 'adult', application_deadline: '2026-10-20', application_status: 'closed',
      grading_date: '2026-11-03', application_opens_on: '2026-10-01', reporting_release_on: released ? '2026-11-02' : '2026-11-04', reporting_time: '10:30:00', official_schedule: true },
    targetGrades: [], gradeSessions: [], onPanel: false, seminar: null, workshop: null, rosterCount: 0 }
}

function page<T>(items: T[], { offset = 0, limit = 50 }: PageOptions = {}): Page<T> {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
}

export function createCalendarFixtureApi(account = 'audit'): InstructorApi {
  const mode = new URLSearchParams(location.search).get('fixtureData')
  let calendarFailed = false
  let rosterFailed = false
  let availabilityFailed = false
  const availabilityStorageKey = `test-only-availability:${account}`
  const initialSlots = mode === 'empty' || mode === 'unlinked' || account !== 'audit' ? [] : mockAvailability(today).map((slot, index) => ({
    id: uuid(50 + index), instructor_id: instructorId,
    date: dateInputValue(slot.date), start_time: `${slot.startTime}:00`, end_time: `${slot.endTime}:00`,
  }))
  const savedSlots: InstructorAvailabilityRow[] = mode === 'availability-persistence'
    ? JSON.parse(sessionStorage.getItem(availabilityStorageKey) ?? 'null') ?? initialSlots : initialSlots
  const availabilityReceipts = new Map<string, AvailabilitySaveResult>()
  const persistAvailability = () => {
    if (mode === 'availability-persistence') sessionStorage.setItem(availabilityStorageKey, JSON.stringify(savedSlots))
  }
  const largeRoster = mode === 'large-roster' || mode === 'attendance-large'
  const storageKey = `test-only-attendance:${account}`
  const attendanceRows = new Map<string, EventStudentRow>(mode === 'attendance-persistence' ? JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') : [])
  const receipts = new Map<string, { input: string; result: AttendanceSaveResult }>()
  const attendanceRequests: AttendanceSaveInput[] = []
  window.attendanceRequestsFixture = attendanceRequests
  let attendanceFailed = false
  let attendanceSaved = false
  let attendanceReloadFailed = false
  let endedDuringSave = false
  const sessionWrites = createSessionWriteFixture(account, mode, () => api)
  const profileStorageKey = `test-only-profile:${account}`
  let profileDetails: InstructorProfileDetails = JSON.parse(sessionStorage.getItem(profileStorageKey) ?? 'null') ?? {
    instructorId: uuid(account === 'audit' ? 1 : 2), userId: uuid(account === 'audit' ? 90001 : 90002),
    address: account === 'audit' && mode !== 'profile-empty' ? '18 Sin Ming Lane\nSingapore 573960' : null,
    employmentType: mode === 'full-time' ? 'full_time' : account === 'audit' && !['profile-empty', 'employment-unset', 'unlinked'].includes(mode ?? '') ? 'part_time' : null, photoPath: null, photoUrl: null,
    grade: null, instructorTitle: 'none', isExaminer: false,
  }
  window.profileWriteRequestsFixture = []
  window.availabilityReadsFixture = 0
  window.availabilityWritesFixture = 0
  window.availabilityRequestsFixture = []
  let profileFailed = false
  let addressFailed = false
  let photoFailed = false
  const persistProfile = () => sessionStorage.setItem(profileStorageKey, JSON.stringify(profileDetails))
  const checkProfileUser = (expected: string) => {
    if (expected !== profileDetails.userId) throw new Error('The signed-in account changed.')
  }
  const api: InstructorApi = {
    // Fixture instructors sit on no grading panel, so the Gradings link stays hidden.
    async getMyGradingPanels(signal) {
      signal?.throwIfAborted()
      return []
    },
    async getAvailabilityAccess(signal) {
      await new Promise(resolve => setTimeout(resolve, 80))
      signal?.throwIfAborted()
      return profileDetails.employmentType === 'part_time'
    },
    async getProfile(expectedUserId, signal) {
      await new Promise(resolve => setTimeout(resolve, mode === 'profile-loading' ? 1600 : 100))
      signal?.throwIfAborted()
      checkProfileUser(expectedUserId)
      if (mode === 'profile-error' && !profileFailed) { profileFailed = true; throw new Error('Unable to load your profile. Please try again.') }
      return { ...profileDetails }
    },
    async saveAddress(expectedUserId, value) {
      window.profileWriteRequestsFixture.push('address')
      await new Promise(resolve => setTimeout(resolve, mode === 'address-slow' ? 1600 : 150))
      checkProfileUser(expectedUserId)
      if (mode === 'address-error' && !addressFailed) { addressFailed = true; throw new Error('Unable to save your address. Your draft is kept; please try again.') }
      profileDetails = { ...profileDetails, address: value.trim() || null }
      persistProfile()
      return profileDetails.address
    },
    async uploadProfilePhoto(expectedUserId, expectedPath, image) {
      window.profileWriteRequestsFixture.push('upload')
      await new Promise(resolve => setTimeout(resolve, mode === 'photo-slow' ? 1600 : 150))
      checkProfileUser(expectedUserId)
      if (mode === 'photo-error' && !photoFailed) { photoFailed = true; throw new Error('Unable to save your photo. Reload your profile, then try again.') }
      if (expectedPath !== profileDetails.photoPath) throw new Error('Photo changed. Reload your profile.')
      const photoUrl = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(image) })
      const saved = { photoPath: `${expectedUserId}/${crypto.randomUUID()}.jpg`, photoUrl }
      profileDetails = { ...profileDetails, ...saved }; persistProfile()
      return saved
    },
    async removeProfilePhoto(expectedUserId, expectedPath) {
      window.profileWriteRequestsFixture.push('remove')
      await new Promise(resolve => setTimeout(resolve, 150))
      checkProfileUser(expectedUserId)
      if (expectedPath !== profileDetails.photoPath) throw new Error('Photo changed. Reload your profile.')
      profileDetails = { ...profileDetails, photoPath: null, photoUrl: null }; persistProfile()
      return { photoPath: null, photoUrl: null }
    },
    getStudents: createDirectoryFixtureReader(account, mode),
    ...createDetailFixtureReads(account, mode, sessionWrites), ...createGradingFixtureReads(account, mode),
    ...createSessionFixtureReads(mode, (...args) => api.getEvent(...args), (...args) => api.getRoster(...args), sessionWrites),
    ...sessionWrites.methods,
    ...createGradingBatchFixture(account, mode, () => api),
    async saveAttendance(input) {
      attendanceRequests.push(structuredClone(input))
      await new Promise(resolve => setTimeout(resolve, mode === 'attendance-slow' ? 1600 : 150))
      if (input.expectedUserId !== uuid(account === 'audit' ? 90001 : 90002) || account !== 'audit') throw new InstructorDataError('forbidden', 'Account changed.')
      const receipt = receipts.get(input.requestId)
      if (receipt) {
        if (receipt.input !== JSON.stringify(input)) throw new InstructorDataError('conflict', 'Request changed. Reload attendance.')
        return receipt.result
      }
      if (mode === 'attendance-error' && !attendanceFailed) { attendanceFailed = true; throw new InstructorDataError('request_failed', 'Attendance could not be saved. Please retry.') }
      if (mode === 'attendance-ends-during-save') { endedDuringSave = true; throw new InstructorDataError('forbidden', 'Attendance is read-only for this session. Reload attendance.') }
      const session = await api.getEvent(input.eventId)
      if (!session || !attendanceEditable(session.event)) throw new InstructorDataError('forbidden', 'Attendance is read-only for this session.')
      const all: RosterEntry[] = []
      let total = 0
      do {
        const next = await api.getRoster(input.eventId, { offset: all.length, limit: 100 })
        if (!next) throw new Error('Missing roster')
        total = next.total; all.push(...next.items)
      } while (all.length < total)
      const selected = input.scope === 'roster' ? all : all.filter(entry => input.expected.some(row => row.studentId === entry.record.student_id))
      if (mode === 'attendance-conflict' && !attendanceFailed) {
        attendanceFailed = true
        const entry = selected[0]
        attendanceRows.set(`${input.eventId}:${entry.record.student_id}`, { ...entry.record, attendance_status: 'absent' })
        throw new InstructorDataError('conflict', 'Attendance changed while saving. Reload attendance, then try again.')
      }
      if (selected.length !== input.expected.length || selected.some(entry => {
        const expected = input.expected.find(row => row.studentId === entry.record.student_id)
        return !expected || JSON.stringify(expected) !== JSON.stringify(attendanceSnapshot(entry.record))
      })) throw new InstructorDataError('conflict', 'Attendance changed. Reload attendance.')
      const editable = editableAttendanceRows(selected, session.event.starts_at)
      for (const entry of editable) attendanceRows.set(`${input.eventId}:${entry.record.student_id}`, {
        ...entry.record, attendance_status: input.status === 'unmarked' ? null : input.status,
      })
      const result: AttendanceSaveResult = { requestId: input.requestId, eventId: input.eventId,
        attendance: selected.map(entry => attendanceSnapshot(attendanceRows.get(`${input.eventId}:${entry.record.student_id}`) ?? entry.record)) }
      receipts.set(input.requestId, { input: JSON.stringify(input), result })
      attendanceSaved = true
      if (mode === 'attendance-persistence') sessionStorage.setItem(storageKey, JSON.stringify([...attendanceRows]))
      if ((mode === 'attendance-lost-response' || mode === 'attendance-retry-after-change') && !attendanceFailed) {
        attendanceFailed = true
        if (mode === 'attendance-retry-after-change') {
          const entry = selected[0]
          attendanceRows.set(`${input.eventId}:${entry.record.student_id}`, { ...entry.record, attendance_status: 'absent' })
        }
        throw new InstructorDataError('request_failed', 'The save response was lost. Please retry.')
      }
      return result
    },
    getClassTypes: async () => mode === 'empty' ? [] : catalogue,
    async getCalendar(options) {
      if (account !== 'audit') await new Promise(resolve => setTimeout(resolve, 800))
      if (mode === 'calendar-error' && !calendarFailed) {
        calendarFailed = true
        throw new InstructorDataError('request_failed', 'Calendar could not be loaded.')
      }
      if (mode === 'loading') await new Promise(resolve => setTimeout(resolve, 2000))
      if (mode === 'race') await new Promise(resolve => setTimeout(resolve, options.from.includes('11-27') ? 1200 : 20))
      if (mode === 'empty' || mode === 'unlinked') return page([], options)
      if (mode === 'date-only-grading' || mode === 'date-only-released') {
        const item = dateOnlyGrading(mode === 'date-only-released')
        return page(item.grading!.grading_date! >= toSingaporeDateTime(options.from).date && item.grading!.grading_date! < toSingaporeDateTime(options.to).date ? [item] : [], options)
      }
      const from = parseCalendarDate(toSingaporeDateTime(options.from).date)!
      const to = parseCalendarDate(toSingaporeDateTime(options.to).date)!
      const entries: CalendarEntry[] = []
      for (let date = from; date < to; date = addDays(date, 1)) {
        for (const template of classTemplates) {
          const item = entry(template.id, date)
          if (item) entries.push({ ...item, event: account === 'audit' ? item.event : { ...item.event,
            id: item.event.id.replace(/^00000000/, '10000000') as EventId, name: 'Replacement account class', instructor_id: uuid(2) as InstructorId },
           rosterCount: mode === 'empty-roster' ? 0 : largeRoster ? 205 : item.rosterCount })
        }
      }
      return page(entries, options)
    },
    async getEvent(id) {
      if (mode === 'empty' || mode === 'unlinked' || (account !== 'audit' && !mode?.startsWith('batch-'))) return null
      if (id === uuid(8800)) return dateOnlyGrading(mode === 'date-only-released')
      const item = findEvent(id)
      if (item && (mode === 'attendance-cancelled' || mode === 'assessment-cancelled' || endedDuringSave)) return { ...item, event: { ...item.event, status: endedDuringSave ? 'completed' : 'cancelled' } }
      return item
    },
    async getAvailability(options) {
      window.availabilityReadsFixture++
      const slots = savedSlots.filter(slot => slot.date >= options.from && slot.date < options.to)
      return page(slots, options)
    },
    async getAvailabilitySlot(id) {
      if (profileDetails.employmentType !== 'part_time') return null
      return savedSlots.find(slot => slot.id === id) ?? null
    },
    async saveAvailability(input) {
      window.availabilityWritesFixture++
      window.availabilityRequestsFixture.push(structuredClone(input))
      if (profileDetails.employmentType !== 'part_time') throw new InstructorDataError('forbidden', 'Availability is only available to part-time instructors.')
      if (input.expectedUserId !== uuid(account === 'audit' ? 90001 : 90002)) throw new InstructorDataError('forbidden', 'Account changed.')
      await new Promise(resolve => setTimeout(resolve, 150))
      const receipt = availabilityReceipts.get(input.requestId)
      if (receipt) return receipt
      const index = savedSlots.findIndex(slot => slot.id === input.slotId)
      if (index < 0) throw new InstructorDataError('conflict', 'This availability was removed. Reload the saved record.')
      if (mode === 'availability-conflict' && !availabilityFailed) {
        availabilityFailed = true
        savedSlots[index] = { ...savedSlots[index], end_time: '10:30:00' }
      }
      const original = savedSlots[index]
      if (input.expected.date !== original.date || input.expected.startTime.slice(0, 5) !== original.start_time.slice(0, 5)
          || input.expected.endTime.slice(0, 5) !== original.end_time.slice(0, 5)) {
        throw new InstructorDataError('conflict', 'This availability changed. Reload the saved record; your draft is kept.')
      }
      const slot = input.kind === 'update' ? { ...original, date: input.value.date,
        start_time: `${input.value.startTime}:00`, end_time: `${input.value.endTime}:00` } : null
      if (slot) savedSlots[index] = slot
      else savedSlots.splice(index, 1)
      const result = { requestId: input.requestId, slotId: input.slotId, kind: input.kind, slot }
      availabilityReceipts.set(input.requestId, result)
      persistAvailability()
      if (mode === 'availability-lost-response' && !availabilityFailed) {
        availabilityFailed = true
        throw new InstructorDataError('request_failed', 'The availability response was lost.')
      }
      return result
    },
    async createAvailability(input) {
      window.availabilityWritesFixture++
      if (profileDetails.employmentType !== 'part_time') throw new InstructorDataError('forbidden', 'Availability is only available to part-time instructors.')
      await new Promise(resolve => setTimeout(resolve, 150))
      if (mode === 'availability-error' && !availabilityFailed) {
        availabilityFailed = true
        throw new InstructorDataError('request_failed', 'Availability could not be saved.')
      }
      const existing = savedSlots.find(slot => slot.date === input.date && slot.start_time === `${input.startTime}:00` && slot.end_time === `${input.endTime}:00`)
      if (existing) return existing
      const saved = { id: uuid(500 + savedSlots.length), instructor_id: instructorId, date: input.date,
        start_time: `${input.startTime}:00`, end_time: `${input.endTime}:00` }
      savedSlots.push(saved)
      persistAvailability()
      return saved
    },
    async getRoster(id, options = {}) {
      if (mode === 'attendance-postread-error' && attendanceSaved && !attendanceReloadFailed) {
        attendanceReloadFailed = true
        throw new InstructorDataError('request_failed', 'The saved roster could not be reloaded.')
      }
      if (id === uuid(8800)) {
        if (mode !== 'assessment-date-only') return page([], options)
        const source = await api.getRoster('00000000-0000-4000-8000-202611070008' as EventId, options)
        return source && { ...source, items: source.items.map(entry => ({ ...entry, record: { ...entry.record, event_id: id } })) }
      }
      if (mode === 'roster-error' && !rosterFailed) {
        rosterFailed = true
        throw new InstructorDataError('request_failed', 'Roster could not be loaded.')
      }
      const session = findEvent(id)
      if (!session) return null
      const sourceDate = parseCalendarDate(toSingaporeDateTime(session.event.starts_at).date)!
      const source = eventsForDate(sourceDate).find(item => eventId(item.id.replace(`-${dateKey(sourceDate)}`, ''), sourceDate) === id)!
      const roster = mode === 'empty-roster' ? [] : largeRoster
        ? Array.from({ length: 205 }, (_, index) => ({ ...students[index % students.length], id: `large-${index}` }))
        : students.filter(student => source.studentIds.includes(student.id))
      const items: RosterEntry[] = roster.map((student, index) => {
        const rank = getGrade(student.gradingSystem, student.rank)!
        const grade = { id: student.rank, label: student.rank.replace('-kyu', 'th Kyu').replace('-dan', 'th Dan'),
          colour: belts[rank.belt].label.replace(' belt', ''), is_ranked: true, sort_order: index }
        const studentId = uuid(100 + (largeRoster ? index : students.findIndex(item => item.id === student.id))) as StudentId
        const start = Date.parse(session.event.starts_at)
        const arrived = new Date(start + (index === 1 ? 6 : 2) * 60_000).toISOString()
        return {
          record: { event_id: id, student_id: studentId, attendance_status: index < 2 ? 'present' : index === 2 ? 'excused' : index === 3 ? 'absent' : null,
            recorded_at: index < 2 ? arrived : null, checked_in_at: index < 2 ? arrived : null,
            assessment_status: null, assessment_notes: null },
          student: { student: { id: studentId, user_id: null, member_no: `ASK-${index}`, first_name: student.name.split(' ')[0], last_name: student.name.split(' ').slice(1).join(' '),
            email: `test-${index}@example.test`, phone: null, home_centre_id: session.centre!.id, date_of_birth: '2000-01-01', current_grade_id: grade.id,
            membership_status: 'active', joined_at: '2020-01-01', last_graded_at: null, follow_up_status: 'none', outstanding_fees: false, ...metadata },
          grade, centre: session.centre },
        }
      })
      return page(items.map(entry => ({ ...entry, record: sessionWrites.decorate(attendanceRows.get(`${id}:${entry.record.student_id}`) ?? entry.record) })), options)
    },
    async getAttendanceRoster(id, signal) {
      if (mode === 'attendance-initial-slow' || (mode === 'attendance-refresh-slow' && attendanceSaved)) {
        await new Promise(resolve => setTimeout(resolve, 1400))
        signal.throwIfAborted()
      }
      const session = await api.getEvent(id, signal)
      if (!session) throw new InstructorDataError('forbidden', 'This session is no longer assigned to your account.')
      const entries = await collectCalendarPages(options => api.getRoster(id, options), item => item.record.student_id, signal)
      return { session, entries, canEditAttendance: account === 'audit' }
    },
  }
  return api
}
