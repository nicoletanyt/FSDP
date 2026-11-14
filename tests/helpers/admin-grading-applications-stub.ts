// Offline responses for the admin applications page. No database or network access.
export const calls: { table: string; columns: string; ordered: boolean }[] = []
export const data: Record<string, { rows: unknown[] | null; error: { message: string } | null }> = {
  grading_applications: { rows: [], error: null },
  grades: { rows: [], error: null },
}

export const supabase = {
  from(table: string) {
    const call = { table, columns: '', ordered: false }
    calls.push(call)
    const query = {
      select(columns: string) { call.columns = columns; return query },
      order() { call.ordered = true; return query },
      then(resolve: (result: { data: unknown[] | null; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: data[table].rows, error: data[table].error }).then(resolve, reject)
      },
    }
    return query
  },
}
