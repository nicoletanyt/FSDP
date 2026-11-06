import { useCallback, useEffect, useState } from 'react'
import type {
  BeltRank,
  ClassOffering,
  Enrollment
} from '@/lib/student-schedule'
import {
  beltRanks,
  conflict,
  dateTime,
  isEligible
} from '@/lib/student-schedule'

type StoredRecord = {
  belt: BeltRank
  enrollments: Enrollment[]
  waitlist: string[]
}

const key = (id: string) => `fsdp:student-schedule:v1:${id}`

function read(id: string): StoredRecord {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(key(id)) || 'null'
    )

    if (
      value &&
      typeof value === 'object' &&
      'enrollments' in value
    ) {
      const item = value as Partial<StoredRecord>

      return {
        belt:
          item.belt && beltRanks.includes(item.belt)
            ? item.belt
            : 'White belt',
        enrollments: Array.isArray(item.enrollments)
          ? item.enrollments
          : [],
        waitlist: Array.isArray(item.waitlist)
          ? item.waitlist.filter(
              (s): s is string => typeof s === 'string'
            )
          : []
      }
    }
  } catch {
    // Invalid demo data should not stop the portal.
  }

  return {
    belt: 'White belt',
    enrollments: [],
    waitlist: []
  }
}

export function useStudentEnrollments(
  userId: string,
  classes: ClassOffering[]
) {
  const [record, setRecord] = useState<StoredRecord>(
    () => read(userId)
  )

  useEffect(() => {
    setRecord(read(userId))
  }, [userId])

  const save = useCallback(
    (fn: (previous: StoredRecord) => StoredRecord) => {
      setRecord(previous => {
        const next = fn(previous)

        try {
          localStorage.setItem(key(userId), JSON.stringify(next))
        } catch {
          // Local storage may be disabled.
        }

        return next
      })
    },
    [userId]
  )

  const active = record.enrollments.filter(
    e => e.status === 'enrolled' || e.status === 'make-up'
  )

  const isBooked = (id: string) =>
    active.some(e => e.id === id)

  const isWaitlisted = (id: string) =>
    record.waitlist.includes(id)

  const isFull = (offering: ClassOffering) =>
    offering.occupied +
      (isBooked(offering.id) ? 1 : 0) >=
    offering.capacity

  const check = (
    offering: ClassOffering,
    exclude?: string
  ): string | null => {
    if (dateTime(offering).getTime() <= Date.now()) {
      return 'This session has already started.'
    }

    if (!isEligible(offering, record.belt)) {
      return 'This class is not suitable for your selected belt.'
    }

    if (isBooked(offering.id)) {
      return 'You are already enrolled in this session.'
    }

    if (isFull(offering)) {
      return 'This class is full. Please join the waitlist instead.'
    }

    if (
      active.some(
        e =>
          e.id !== exclude &&
          classes.some(
            c => c.id === e.id && conflict(c, offering)
          )
      )
    ) {
      return 'You already have a class at that time.'
    }

    return null
  }

  const enroll = (offering: ClassOffering): string | null => {
    const error = check(offering)
    if (error) return error

    if (record.enrollments.some(e => e.id === offering.id)) {
      return 'This session already exists in your history.'
    }

    save(prev => ({
      ...prev,
      enrollments: [
        ...prev.enrollments,
        { id: offering.id, status: 'enrolled' }
      ],
      waitlist: prev.waitlist.filter(
        id => id !== offering.id
      )
    }))

    return null
  }

  const joinWaitlist = (
    offering: ClassOffering
  ): string | null => {
    if (dateTime(offering).getTime() <= Date.now()) {
      return 'This session has already started.'
    }

    if (!isEligible(offering, record.belt)) {
      return 'This class is not suitable for your selected belt.'
    }

    if (isBooked(offering.id)) {
      return 'You are already enrolled.'
    }

    if (isWaitlisted(offering.id)) {
      return 'You are already on the waitlist.'
    }

    if (!isFull(offering)) {
      return 'A spot is currently available. Please enrol instead.'
    }

    save(prev => ({
      ...prev,
      waitlist: [...prev.waitlist, offering.id]
    }))

    return null
  }

  const leaveWaitlist = (id: string) => {
    save(prev => ({
      ...prev,
      waitlist: prev.waitlist.filter(item => item !== id)
    }))
  }

  const cancel = (id: string) => {
    save(prev => ({
      ...prev,
      enrollments: prev.enrollments.filter(
        e => e.id !== id
      )
    }))
  }

  const reschedule = (
    originalId: string,
    replacement: ClassOffering
  ): string | null => {
    if (!isBooked(originalId)) {
      return 'The original booking no longer exists.'
    }

    if (originalId === replacement.id) {
      return 'Select a different session.'
    }

    const error = check(replacement, originalId)
    if (error) return error

    if (
      record.enrollments.some(
        e => e.id === replacement.id
      )
    ) {
      return 'This session already exists in your history.'
    }

    save(prev => ({
      ...prev,
      enrollments: [
        ...prev.enrollments.filter(
          e => e.id !== originalId
        ),
        {
          id: replacement.id,
          status: 'make-up',
          movedFrom: originalId
        }
      ]
    }))

    return null
  }

  return {
    ...record,
    active,
    setBelt: (belt: BeltRank) =>
      save(prev => ({ ...prev, belt })),
    isBooked,
    isFull,
    isWaitlisted,
    check,
    enroll,
    cancel,
    reschedule,
    joinWaitlist,
    leaveWaitlist
  }
}
