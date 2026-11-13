import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { initialAdminData } from './mock-data'
import type { AdminData } from './mock-data'
import type {
  FollowUpStatus,
  NewNotificationInput,
  NewOpportunityInput,
} from './types'

interface AdminDataContextValue extends AdminData {
  createOpportunity: (input: NewOpportunityInput) => void
  sendNotification: (input: NewNotificationInput) => void
  updateFollowUp: (studentId: string, status: FollowUpStatus) => void
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AdminData>(initialAdminData)

  const createOpportunity = useCallback((input: NewOpportunityInput) => {
    setData((current) => ({
      ...current,
      opportunities: [
        ...current.opportunities,
        { ...input, id: newId('opportunity'), status: 'open' },
      ],
    }))
  }, [])

  const sendNotification = useCallback((input: NewNotificationInput) => {
    setData((current) => ({
      ...current,
      notifications: [
        {
          ...input,
          id: newId('notification'),
          sentAt: new Date().toISOString(),
          deliveredCount: input.recipientCount,
          failedCount: 0,
        },
        ...current.notifications,
      ],
    }))
  }, [])

  const updateFollowUp = useCallback(
    (studentId: string, status: FollowUpStatus) => {
      setData((current) => ({
        ...current,
        students: current.students.map((student) =>
          student.id === studentId ? { ...student, followUpStatus: status } : student,
        ),
      }))
    },
    [],
  )

  const value = useMemo(
    () => ({
      ...data,
      createOpportunity,
      sendNotification,
      updateFollowUp,
    }),
    [
      data,
      createOpportunity,
      sendNotification,
      updateFollowUp,
    ],
  )

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const context = useContext(AdminDataContext)
  if (!context) throw new Error('useAdminData must be used inside AdminDataProvider.')
  return context
}
