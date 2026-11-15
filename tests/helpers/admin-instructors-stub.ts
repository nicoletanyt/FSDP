// In-memory response for admin instructor directory tests; no real writes.
export const calls: unknown[][] = []
export let rows: Record<string, unknown>[] = []
export let readError: { message: string } | null = null
export let updateError: { code: string; message: string } | null = null

export function failUpdate(error: { code: string; message: string } | null) { updateError = error }

export function configure(nextRows: Record<string, unknown>[], error: { message: string } | null = null) {
  rows = nextRows
  readError = error
  updateError = null
  calls.length = 0
}

export const supabase = {
  from(table: string) {
    let updating: boolean | undefined
    let id: string | undefined
    const query = {
      select(columns: string) { calls.push(['select', table, columns]); return query },
      eq(column: string, value: unknown) {
        calls.push(['eq', table, column, value])
        if (column === 'id') id = String(value)
        return query
      },
      order(column: string) { calls.push(['order', table, column]); return query },
      update(patch: { is_examiner: boolean }) { calls.push(['update', table, patch]); updating = patch.is_examiner; return query },
      maybeSingle() {
        const person = rows.find(row => (row.instructors as { id: string } | null)?.id === id)
        if (!updateError && person && person.instructors && updating !== undefined) {
          (person.instructors as { is_examiner: boolean }).is_examiner = updating
        }
        return Promise.resolve({ data: person ? { is_examiner: updating } : null, error: updateError })
      },
      then(resolve: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: readError ? null : rows.map(row => ({ ...row, instructors: row.instructors ? { ...row.instructors as object } : null })), error: readError }).then(resolve, reject)
      },
    }
    return query
  },
}
