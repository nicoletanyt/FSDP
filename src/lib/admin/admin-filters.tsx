import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type AdminDateRange = 30 | 90 | 180

interface AdminFiltersValue {
  centreId: string
  setCentreId: (centreId: string) => void
  dateRange: AdminDateRange
  setDateRange: (range: AdminDateRange) => void
}

const STORAGE_KEY = 'fsdp-admin-centre'

const AdminFiltersContext = createContext<AdminFiltersValue | undefined>(undefined)

function readStoredCentre(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? 'all'
  } catch {
    return 'all'
  }
}

export function AdminFiltersProvider({ children }: { children: ReactNode }) {
  const [centreId, setCentreId] = useState(readStoredCentre)
  const [dateRange, setDateRange] = useState<AdminDateRange>(30)

  useEffect(() => {
    try {
      if (centreId === 'all') window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, centreId)
    } catch {
      // The filter still works for this session if storage is unavailable.
    }
  }, [centreId])

  const value = useMemo(
    () => ({ centreId, setCentreId, dateRange, setDateRange }),
    [centreId, dateRange],
  )

  return <AdminFiltersContext.Provider value={value}>{children}</AdminFiltersContext.Provider>
}

export function useAdminFilters() {
  const context = useContext(AdminFiltersContext)
  if (!context) throw new Error('useAdminFilters must be used inside AdminFiltersProvider.')
  return context
}
