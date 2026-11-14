// Offline responses for the sent-emails page; never connects to a real database.
export const calls: { table: string; columns: string; order: string; limit: number | null }[] = []
export const data: Record<string, { rows: unknown[] | null; error: { message: string } | null }> = {
  grading_email_sends: { rows: [], error: null },
  admin_attendance_email_sends: { rows: [], error: null },
}

export const supabase = {
  from(table: string) {
    const call = { table, columns: '', order: '', limit: null as number | null }
    calls.push(call)
    const query = {
      select(columns: string) { call.columns = columns; return query },
      order(column: string) { call.order = column; return query },
      limit(count: number) { call.limit = count; return query },
      then(resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown,
        reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: data[table].rows, error: data[table].error }).then(resolve, reject)
      },
    }
    return query
  },
}
