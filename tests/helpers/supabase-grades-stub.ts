// Offline stand-in for '@/lib/supabase' in form tests: serves ranked grades only.
const grades = [
  { id: 'black-2nd-kyu', label: 'Black (2nd Kyu)', colour: 'Black', is_ranked: true, sort_order: 13 },
  { id: '1st-dan', label: '1st Dan', colour: 'Black', is_ranked: true, sort_order: 17 },
  { id: '2nd-dan', label: '2nd Dan', colour: 'Black', is_ranked: true, sort_order: 18 },
  { id: '4th-dan', label: '4th Dan', colour: 'Black', is_ranked: true, sort_order: 20 },
]
export const gradeQueries: unknown[][] = []
export const supabase = {
  from(table: string) {
    const query = {
      select(columns: string) { gradeQueries.push(['select', table, columns]); return query },
      eq(column: string, value: unknown) { gradeQueries.push(['eq', column, value]); return query },
      order(column: string) { gradeQueries.push(['order', column]); return Promise.resolve({ data: grades, error: null }) },
    }
    return query
  },
}
