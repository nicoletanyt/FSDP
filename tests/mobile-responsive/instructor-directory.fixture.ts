// Test-only database-shaped directory responses. No production fixture fallback.
import { students } from '../../src/lib/instructor-calendar'
import { belts, compareRanks, formatRank, getGrade } from '../../src/lib/student-grades'
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { CentreRow, GradeRow, StudentEntry, StudentId } from '../../src/lib/instructor/types'

declare global {
  interface Window {
    directoryRequestsFixture: { offset: number; limit: number; search: string | null; gradeId: string | null; colour: string | null; centreId: string | null }[]
  }
}

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const metadata = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const centres: CentreRow[] = ['Central Dojo', 'Northside Dojo'].map((name, index) => ({
  id: uuid(10 + index) as CentreRow['id'], name, short_name: name, address: '', timezone: 'Asia/Singapore',
  status: 'active', capacity: index ? 18 : 24, ...metadata,
}))
const ranks = [...new Set(students.map(student => student.rank))].sort(compareRanks)

export function directoryEntries(): StudentEntry[] {
  return students.map((student, index) => {
    const rank = getGrade(student.gradingSystem, student.rank)!
    const grade: GradeRow = { id: student.rank, label: formatRank(student.rank),
      colour: belts[rank.belt].label.replace(' belt', ''), is_ranked: true, sort_order: ranks.indexOf(student.rank) + 1 }
    const centre = centres[index % 3 === 1 ? 1 : 0]
    return { grade, centre, student: {
      id: uuid(100 + index) as StudentId, user_id: null, member_no: `STU-${String(index + 1).padStart(4, '0')}`,
      first_name: student.name.split(' ')[0], last_name: student.name.split(' ').slice(1).join(' '),
      email: `member-${index}@example.test`, phone: null, home_centre_id: centre.id,
      date_of_birth: student.gradingSystem === 'children' ? '2016-01-01' : '1986-01-01',
      current_grade_id: grade.id, membership_status: 'active', joined_at: '2020-01-01', last_graded_at: null,
      follow_up_status: 'none', outstanding_fees: false, ...metadata,
    } }
  })
}

export function createDirectoryFixtureReader(account: string, mode: string | null): InstructorApi['getStudents'] {
  let failed = false
  const requests: Window['directoryRequestsFixture'] = []
  window.directoryRequestsFixture = requests
  return async (options = {}) => {
    requests.push({ offset: options.offset ?? 0, limit: options.limit ?? 50, search: options.search ?? null,
      gradeId: options.gradeId ?? null, colour: options.colour ?? null, centreId: options.centreId ?? null })
    if (account !== 'audit') await new Promise(resolve => setTimeout(resolve, 800))
    if (mode === 'directory-loading') await new Promise(resolve => setTimeout(resolve, 2000))
    if (!failed && (mode === 'directory-error' || (mode === 'directory-page-error' && (options.offset ?? 0) > 0))) {
      failed = true
      throw new InstructorDataError('request_failed', 'Students could not be loaded.')
    }
    let scope = directoryEntries()
    if (mode === 'directory-empty') scope = []
    if (mode === 'directory-all-students' || mode === 'unlinked') {
      const centre: CentreRow = { ...centres[0], id: uuid(12) as CentreRow['id'], name: 'Other Dojo', short_name: 'other' }
      const grade: GradeRow = { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 }
      scope.push({ centre, grade, student: { ...scope[0].student,
        id: uuid(8000) as StudentId, member_no: 'UNASSIGNED-1', first_name: 'Unassigned', last_name: 'Student',
        home_centre_id: centre.id, current_grade_id: grade.id, date_of_birth: '2000-01-01', membership_status: 'expired' } })
    }
    if (mode === 'directory-paginated' || mode === 'directory-page-error') scope = Array.from({ length: 205 }, (_, index) => {
      const entry = scope[index % scope.length]
      return { ...entry, student: { ...entry.student, id: uuid(1000 + index) as StudentId,
        first_name: `Member ${String(index + 1).padStart(3, '0')}`, last_name: 'Pagination', member_no: `ASK-${String(index + 1).padStart(4, '0')}` } }
    })
    if (mode === 'directory-unranked') {
      const entry = scope.find(item => item.student.id === uuid(102))!
      entry.grade = { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 }
      entry.student.current_grade_id = 'unranked'
    }
    if (account !== 'audit' && scope.length) scope = [{ ...scope[0], student: { ...scope[0].student,
      id: uuid(9000) as StudentId, first_name: 'Replacement', last_name: 'Account', member_no: 'NEW-ACCOUNT' } }]
    scope.sort((a, b) => a.student.last_name.toLowerCase().localeCompare(b.student.last_name.toLowerCase())
      || a.student.first_name.toLowerCase().localeCompare(b.student.first_name.toLowerCase()) || a.student.id.localeCompare(b.student.id))
    const search = options.search?.trim().toLowerCase() ?? ''
    const filtered = scope.filter(({ student, grade }) =>
      (!search || `${student.first_name} ${student.last_name}`.toLowerCase().includes(search) || student.member_no.toLowerCase().includes(search))
      && (!options.gradeId || student.current_grade_id === options.gradeId)
      && (!options.colour || grade?.colour === options.colour)
      && (!options.centreId || student.home_centre_id === options.centreId))
    const offset = options.offset ?? 0
    const limit = options.limit ?? 50
    const grades = [...new Map(scope.filter(item => item.grade).map(item => [item.grade!.id, item.grade!])).values()].sort((a, b) => a.sort_order - b.sort_order)
    const scopeCentres = [...new Map(scope.filter(item => item.centre).map(item => [item.centre!.id, item.centre!])).values()].sort((a, b) => a.name.localeCompare(b.name))
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, scopeTotal: scope.length, offset, limit,
      facets: { grades, colours: [...new Set(grades.flatMap(grade => grade.colour ? [grade.colour] : []))].sort(), centres: scopeCentres } }
  }
}
