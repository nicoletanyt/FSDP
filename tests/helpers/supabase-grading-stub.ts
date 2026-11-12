// Offline stand-in for '@/lib/supabase' in admin grading tests. Tests set the
// grading day and batches it serves, and what other functions return; every
// call is recorded.
export const calls: unknown[][] = []
export const data: {
  day: unknown
  batches: Record<string, unknown>[]
  gradings: Record<string, unknown>[]
  responses: Record<string, unknown>
  errors: Record<string, { code: string; message: string }>
} = { day: null, batches: [], gradings: [], responses: {}, errors: {} }

export const supabase = {
  rpc(name: string, args: unknown) {
    calls.push(['rpc', name, args])
    if (data.errors[name]) return Promise.resolve({ data: null, error: data.errors[name] })
    return Promise.resolve({ data: name in data.responses ? data.responses[name] : data.day, error: null })
  },
  from(table: string) {
    const filters: [string, unknown][] = []
    const ranges: ((row: Record<string, unknown>) => boolean)[] = []
    const query = {
      select(columns: string) { calls.push(['select', table, columns.replace(/\s+/g, '')]); return query },
      eq(column: string, value: unknown) { filters.push([column, value]); return query },
      in() { return query },
      gte(column: string, value: string) { ranges.push(row => String(row[column]) >= value); return query },
      lt(column: string, value: string) { ranges.push(row => String(row[column]) < value); return query },
      order() { return query },
      limit() { return query },
      then(resolve: (value: { data: unknown; error: null }) => unknown) {
        const source = table === 'gradings' ? data.gradings : data.batches
        const rows = source.filter(row => ranges.every(test => test(row))
          && filters.every(([name, value]) => name === 'event_id' || name === 'official_schedule' || row[name] === value))
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return query
  },
}
