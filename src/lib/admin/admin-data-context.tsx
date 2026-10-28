import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { initialAdminData } from './mock-data'
import type { AdminData } from './mock-data'
import type {
  AttendanceStatus,
  FollowUpStatus,
  NewNotificationInput,
  NewOpportunityInput,
  NewSessionInput,
} from './types'

interface AdminDataContextValue extends AdminData {
  createSession: (input: NewSessionInput) => void
  saveAttendance: (
    sessionId: string,
    entries: { studentId: string; status: AttendanceStatus }[],
  ) => void
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

  const createSession = useCallback((input: NewSessionInput) => {
    setData((current) => ({
      ...current,
      sessions: [...current.sessions, { ...input, id: newId('ses') }],
    }))
  }, [])

  const saveAttendance = useCallback(
    (
      sessionId: string,
      entries: { studentId: string; status: AttendanceStatus }[],
    ) => {
      setData((current) => ({
        ...current,
        attendance: [
          ...current.attendance.filter((record) => record.sessionId !== sessionId),
          ...entries.map((entry) => ({
            id: newId('att'),
            sessionId,
            studentId: entry.studentId,
            status: entry.status,
            recordedAt: new Date().toISOString(),
            recordedBy: 'Administrator',
          })),
        ],
      }))
    },
    [],
  )

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
      createSession,
      saveAttendance,
      createOpportunity,
      sendNotification,
      updateFollowUp,
    }),
    [
      data,
      createSession,
      saveAttendance,
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
