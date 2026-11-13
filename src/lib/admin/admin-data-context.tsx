import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { initialAdminData } from './mock-data'
import type { AdminData } from './mock-data'
import type {
  AttendanceStatus,
  FollowUpStatus,
  NewNotificationInput,
  NewOpportunityInput,
} from './types'

interface AdminDataContextValue extends AdminData {
  saveAttendance: (
    sessionId: string,
    entries: { studentId: string; status: AttendanceStatus }[],
  ) => void
  createOpportunity: (input: NewOpportunityInput) => void
  sendNotification: (input: NewNotificationInput) => void
  updateFollowUp: (studentId: string, status: FollowUpStatus) => void
  signOffTechnique: (
    studentId: string,
    itemId: string,
    signedOffBy?: string,
    note?: string,
  ) => void
  clearTechniqueSignOff: (studentId: string, itemId: string) => void
}

const AdminDataContext = createContext<AdminDataContextValue | undefined>(undefined)

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AdminData>(initialAdminData)

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

  const signOffTechnique = useCallback(
    (
      studentId: string,
      itemId: string,
      signedOffBy = 'Administrator',
      note?: string,
    ) => {
      setData((current) => {
        if (
          current.techniqueSignOffs.some(
            (signOff) =>
              signOff.studentId === studentId && signOff.itemId === itemId,
          )
        ) {
          return current
        }
        return {
          ...current,
          techniqueSignOffs: [
            ...current.techniqueSignOffs,
            {
              id: newId('signoff'),
              studentId,
              itemId,
              signedOffAt: new Date().toISOString(),
              signedOffBy,
              note,
            },
          ],
        }
      })
    },
    [],
  )

  const clearTechniqueSignOff = useCallback(
    (studentId: string, itemId: string) => {
      setData((current) => ({
        ...current,
        techniqueSignOffs: current.techniqueSignOffs.filter(
          (signOff) =>
            !(
              signOff.studentId === studentId && signOff.itemId === itemId
            ),
        ),
      }))
    },
    [],
  )

  const value = useMemo(
    () => ({
      ...data,
      saveAttendance,
      createOpportunity,
      sendNotification,
      updateFollowUp,
      signOffTechnique,
      clearTechniqueSignOff,
    }),
    [
      data,
      saveAttendance,
      createOpportunity,
      sendNotification,
      updateFollowUp,
      signOffTechnique,
      clearTechniqueSignOff,
    ],
  )

  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>
}

export function useAdminData() {
  const context = useContext(AdminDataContext)
  if (!context) throw new Error('useAdminData must be used inside AdminDataProvider.')
  return context
}
