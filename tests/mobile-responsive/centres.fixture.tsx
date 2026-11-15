// No production credentials or network requests: only the Supabase centres query is mocked.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import Centres from '../../src/pages/admin/Centres'
import { AuthContext } from '../../src/lib/auth-context'
import { supabase } from '../../src/lib/supabase'
import '../../src/index.css'

declare global {
  interface Window { centreFixtureCalls: number }
}

const params = new URLSearchParams(location.search)
const state = params.get('state') ?? 'success'
const rows = state === 'empty' ? [] : [
  { id: 'a', name: 'Central Dojo', short_name: 'CD', address: '123 Central Street, Singapore', timezone: 'Asia/Singapore', status: 'active' },
  { id: 'b', name: 'East Dojo', short_name: 'ED', address: '456 East Road, Singapore', timezone: 'Asia/Singapore', status: 'closed' },
  { id: 'c', name: 'West Dojo', short_name: 'WD', address: '789 West Street, Singapore', timezone: 'Asia/Singapore', status: 'under_renovation' },
]
window.centreFixtureCalls = 0
Object.defineProperty(supabase, 'from', { configurable: true, value: (table: string) => {
  if (table !== 'centres') throw new Error(`Unexpected table: ${table}`)
  return {
    select() { return this },
    order() { return this },
    range(from: number, to: number) { return { abortSignal: async () => {
      window.centreFixtureCalls++
      if (state === 'error') return { data: null, error: { message: 'Fixture read failure' } }
      return { data: rows.slice(from, to + 1), error: null }
    } } },
  }
} })

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function StudentFixture() {
  const { search } = useLocation()
  return <h1>Student directory fixture {search}</h1>
}

createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={{ session: { user: { id: 'fixture-admin' } } as never, profile: null,
    loading: false, error: null, reloadProfile: () => {}, signOut: async () => {} }}>
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/centres${params.get('filters') ? `?${params.get('filters')}` : ''}`]}>
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
          <Routes>
            <Route path="/admin/centres" element={<Centres />} />
            <Route path="/admin/students" element={<StudentFixture />} />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>
  </AuthContext.Provider>,
)
