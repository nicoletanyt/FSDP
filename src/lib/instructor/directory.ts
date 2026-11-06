import { dateOnly } from './decoders'
import { parseEntityId, toSingaporeDateTime } from './adapters'
import { InstructorDataError } from './errors'
import type { DirectoryOptions, GradeTrack, StudentDirectory, StudentEntry } from './types'

export const DIRECTORY_PAGE_SIZE = 50

export function directoryPage(params: URLSearchParams): number {
  const raw = params.get('page')
  const page = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1
  return Number.isSafeInteger(page) && (page - 1) * DIRECTORY_PAGE_SIZE <= 2_147_483_647 - DIRECTORY_PAGE_SIZE ? page : 1
}

export function directoryOptions(params: URLSearchParams): DirectoryOptions {
  if ((params.get('q')?.length ?? 0) > 200) {
    throw new InstructorDataError('invalid_request', 'Use a student search of at most 200 characters.')
  }
  return {
    search: params.get('q') ?? '',
    gradeId: params.get('rank') || undefined,
    colour: params.get('belt') || undefined,
    centreId: params.get('dojo') ? parseEntityId(params.get('dojo'), 'centre') : undefined,
    limit: DIRECTORY_PAGE_SIZE,
    offset: (directoryPage(params) - 1) * DIRECTORY_PAGE_SIZE,
  }
}

export interface DirectorySnapshot {
  readonly items: readonly StudentEntry[]
  readonly facets: StudentDirectory['facets']
}

// Fetch every unfiltered page once. Search and visible-page changes operate on
// this account-scoped, in-memory snapshot rather than invoking the API again.
export async function loadDirectorySnapshot(
  read: (options: DirectoryOptions) => Promise<StudentDirectory>,
  signal: AbortSignal,
): Promise<DirectorySnapshot> {
  const items: StudentEntry[] = []
  const seen = new Set<string>()
  let total: number | undefined
  let facets: StudentDirectory['facets'] | undefined
  let facetFingerprint: string | undefined
  do {
    signal.throwIfAborted()
    const page = await read({ limit: 100, offset: items.length, signal })
    signal.throwIfAborted()
    const fingerprint = JSON.stringify(page.facets)
    if ((total !== undefined && page.total !== total) || page.scopeTotal !== page.total
        || page.offset !== items.length || page.limit !== 100
        || (facetFingerprint !== undefined && fingerprint !== facetFingerprint)
        || (!page.items.length && items.length < page.total)) {
      throw new InstructorDataError('request_failed', 'Student records changed while loading. Please retry.')
    }
    total = page.total
    facets = page.facets
    facetFingerprint = fingerprint
    for (const entry of page.items) {
      if (seen.has(entry.student.id)) {
        throw new InstructorDataError('request_failed', 'Student records changed while loading. Please retry.')
      }
      seen.add(entry.student.id)
      items.push(entry)
    }
  } while (items.length < total)
  if (items.length !== total || !facets) {
    throw new InstructorDataError('invalid_data', 'The student directory response is incomplete.')
  }
  return { items, facets }
}

export function filterDirectorySnapshot(snapshot: DirectorySnapshot, params: URLSearchParams): StudentDirectory {
  const { search = '', gradeId, colour, centreId, limit = DIRECTORY_PAGE_SIZE, offset = 0 } = directoryOptions(params)
  const query = search.trim().toLowerCase()
  const filtered = snapshot.items.filter(({ student, grade }) =>
    (!query || `${student.first_name} ${student.last_name}`.toLowerCase().includes(query)
      || student.member_no.toLowerCase().includes(query))
    && (!gradeId || student.current_grade_id === gradeId)
    && (!colour || grade?.colour === colour)
    && (!centreId || student.home_centre_id === centreId))
  return { items: filtered.slice(offset, offset + limit), total: filtered.length,
    scopeTotal: snapshot.items.length, offset, limit, facets: snapshot.facets }
}

export function changeDirectoryFilter(params: URLSearchParams, name: 'q' | 'rank' | 'belt' | 'dojo', value: string) {
  const next = new URLSearchParams(params)
  if (value) next.set(name, value)
  else next.delete(name)
  next.delete('page')
  return next
}

export function clearDirectoryFilters(params: URLSearchParams, includeSearch: boolean) {
  const next = new URLSearchParams(params)
  for (const key of ['rank', 'belt', 'dojo', 'page']) next.delete(key)
  if (includeSearch) next.delete('q')
  return next
}

export function singaporeToday() {
  return toSingaporeDateTime(new Date().toISOString()).date
}

export function directoryTrack(dateOfBirth: string, today: string): GradeTrack | null {
  dateOnly(dateOfBirth)
  dateOnly(today)
  if (dateOfBirth > today) return null
  return Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) < 13 ? 'children' : 'adult'
}

export function directoryStudent(entry: StudentEntry, today: string) {
  const track = directoryTrack(entry.student.date_of_birth, today)
  return {
    id: entry.student.id,
    name: [entry.student.first_name.trim(), entry.student.last_name.trim()].filter(Boolean).join(' ') || entry.student.email,
    memberNo: entry.student.member_no,
    grade: entry.grade,
    principalDojo: entry.centre?.name ?? 'Dojo not recorded',
    trackLabel: track === 'children' ? "Children's grading" : track === 'adult' ? "Adults' grading" : 'Grading track unverified',
  }
}
