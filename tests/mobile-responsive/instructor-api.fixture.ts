// Test-only read provider. Production calendar code never imports these records.
import { addDays, classTemplates, classTypes, dateKey, dojoCapacities, eventsForDate, parseCalendarDate, students } from '../../src/lib/instructor-calendar'
import { getGrade, belts } from '../../src/lib/student-grades'
import { mockAvailability, dateInputValue } from '../../src/lib/instructor-availability'
import { toSingaporeDateTime } from '../../src/lib/instructor/adapters'
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { CalendarEntry, CentreRow, EventId, Page, PageOptions, RosterEntry, StudentId, InstructorId, InstructorAvailabilityRow } from '../../src/lib/instructor/types'
import { createDirectoryFixtureReader } from './instructor-directory.fixture'
import { createDetailFixtureReads } from './instructor-detail.fixture'

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
    grading: source.type === 'grading' ? { event_id: id, track: null, application_deadline: null, application_status: 'closed' } : null,
    targetGrades: [], seminar: null, workshop: null, rosterCount: source.studentIds.length,
  }
}

function findEvent(id: string) {
  const match = /^00000000-0000-4000-8000-(\d{4})(\d{2})(\d{2})(\d{4})$/.exec(id)
  if (!match) return null
  const date = parseCalendarDate(`${match[1]}-${match[2]}-${match[3]}`)
  const template = classTemplates[Number(match[4]) - 1]
  return date && template ? entry(template.id, date) : null
}

function page<T>(items: T[], { offset = 0, limit = 50 }: PageOptions = {}): Page<T> {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
}

export function createCalendarFixtureApi(account = 'audit'): InstructorApi {
  const mode = new URLSearchParams(location.search).get('fixtureData')
  let calendarFailed = false
  let rosterFailed = false
  let availabilityFailed = false
  const savedSlots: InstructorAvailabilityRow[] = []
  const unsupported = async (): Promise<never> => { throw new Error('Unexpected fixture API operation') }
  return {
    getCurrentInstructor: unsupported, getReferenceData: unsupported, getStudents: createDirectoryFixtureReader(account, mode),
    ...createDetailFixtureReads(account, mode), getRecordedAssessments: unsupported,
    getSessionReports: unsupported, getTechniqueSignOffs: unsupported, getAssessment: unsupported,
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
      const from = parseCalendarDate(toSingaporeDateTime(options.from).date)!
      const to = parseCalendarDate(toSingaporeDateTime(options.to).date)!
      const entries: CalendarEntry[] = []
      for (let date = from; date < to; date = addDays(date, 1)) {
        for (const template of classTemplates) {
          const item = entry(template.id, date)
          if (item) entries.push({ ...item, event: account === 'audit' ? item.event : { ...item.event,
            id: item.event.id.replace(/^00000000/, '10000000') as EventId, name: 'Replacement account class', instructor_id: uuid(2) as InstructorId },
          rosterCount: mode === 'empty-roster' ? 0 : mode === 'large-roster' ? 205 : item.rosterCount })
        }
      }
      return page(entries, options)
    },
    async getEvent(id) {
      if (mode === 'empty' || mode === 'unlinked' || account !== 'audit') return null
      return findEvent(id)
    },
    async getAvailability(options) {
      const initialSlots = mode === 'empty' || mode === 'unlinked' || account !== 'audit' ? [] : mockAvailability(today).map((slot, index) => ({
        id: uuid(50 + index), instructor_id: instructorId,
        date: dateInputValue(slot.date), start_time: `${slot.startTime}:00`, end_time: `${slot.endTime}:00`,
      }))
      const slots = [...initialSlots, ...savedSlots].filter(slot => slot.date >= options.from && slot.date < options.to)
      return page(slots, options)
    },
    async createAvailability(input) {
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
      return saved
    },
    async getRoster(id, options = {}) {
      if (mode === 'roster-error' && !rosterFailed) {
        rosterFailed = true
        throw new InstructorDataError('request_failed', 'Roster could not be loaded.')
      }
      const session = findEvent(id)
      if (!session) return null
      const sourceDate = parseCalendarDate(toSingaporeDateTime(session.event.starts_at).date)!
      const source = eventsForDate(sourceDate).find(item => eventId(item.id.replace(`-${dateKey(sourceDate)}`, ''), sourceDate) === id)!
      const roster = mode === 'empty-roster' ? [] : mode === 'large-roster'
        ? Array.from({ length: 205 }, (_, index) => ({ ...students[index % students.length], id: `large-${index}` }))
        : students.filter(student => source.studentIds.includes(student.id))
      const items: RosterEntry[] = roster.map((student, index) => {
        const rank = getGrade(student.gradingSystem, student.rank)!
        const grade = { id: student.rank, label: student.rank.replace('-kyu', 'th Kyu').replace('-dan', 'th Dan'),
          colour: belts[rank.belt].label.replace(' belt', ''), is_ranked: true, sort_order: index }
        const studentId = uuid(100 + (mode === 'large-roster' ? index : students.findIndex(item => item.id === student.id))) as StudentId
        const start = Date.parse(session.event.starts_at)
        const arrived = new Date(start + (index === 1 ? 6 : 2) * 60_000).toISOString()
        return {
          record: { event_id: id, student_id: studentId, attendance_status: index < 2 ? 'present' : index === 2 ? 'excused' : index === 3 ? 'absent' : null,
            recorded_at: index < 2 ? arrived : null, checked_in_at: index < 2 ? arrived : null,
            report: null, report_author_id: null, assessment_status: null, assessment_notes: null },
          student: { student: { id: studentId, user_id: null, member_no: `ASK-${index}`, first_name: student.name.split(' ')[0], last_name: student.name.split(' ').slice(1).join(' '),
            email: `test-${index}@example.test`, phone: null, home_centre_id: session.centre!.id, date_of_birth: '2000-01-01', current_grade_id: grade.id,
            membership_status: 'active', joined_at: '2020-01-01', last_graded_at: null, follow_up_status: 'none', outstanding_fees: false, ...metadata },
          grade, centre: session.centre },
        }
      })
      return page(items, options)
    },
  }
}
