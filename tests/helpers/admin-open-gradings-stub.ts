// In-memory Supabase stand-in; no network or database writes.
export const calls: { table: string; columns: string; filters: [string, unknown][] }[] = []
export let rows: Record<string, unknown>[] = []
export let failure: { message: string } | null = null

export function configure(nextRows: Record<string, unknown>[], nextFailure: { message: string } | null = null) {
  rows = nextRows
  failure = nextFailure ? new Error(nextFailure.message) : null
  calls.length = 0
}

export const supabase = {
  from(table: string) {
    const call = { table, columns: '', filters: [] as [string, unknown][] }
    calls.push(call)
    const query = {
      select(columns: string) { call.columns = columns; return query },
      eq(column: string, value: unknown) { call.filters.push([column, value]); return query },
      then(resolve: (value: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: failure ? null : rows, error: failure }).then(resolve, reject)
      },
    }
    return query
  },
}
