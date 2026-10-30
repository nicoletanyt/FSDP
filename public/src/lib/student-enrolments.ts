import { useCallback, useEffect, useState } from 'react'
import type { BeltRank, ClassOffering, Enrollment } from '@/lib/student-schedule'
import { beltRanks, conflict, dateTime } from '@/lib/student-schedule'

interface StoredRecord { belt: BeltRank; enrollments: Enrollment[] }
function key(userId: string) { return `fsdp:student-schedule:v1:${userId}` }
function read(userId: string): StoredRecord {
  try {
    const raw = localStorage.getItem(key(userId))
    if (raw) {
      const value: unknown = JSON.parse(raw)
      if (value && typeof value === 'object' && 'belt' in value && 'enrollments' in value) {
        const record = value as StoredRecord
        if (beltRanks.includes(record.belt) && Array.isArray(record.enrollments)) return record
      }
    }
  } catch { /* Broken local demo state should not stop the portal from loading. */ }
  return { belt: 'White belt', enrollments: [] }
}
export function useStudentEnrollments(userId: string, classes: ClassOffering[]) {
  const [record, setRecord] = useState<StoredRecord>(() => read(userId))
  useEffect(() => setRecord(read(userId)), [userId])
  const save = useCallback((update: (value: StoredRecord) => StoredRecord) => {
    setRecord(previous => {
      const next = update(previous)
      try { localStorage.setItem(key(userId), JSON.stringify(next)) } catch { /* Private browsing may disable storage. */ }
      return next
    })
  }, [userId])
  const setBelt = (belt: BeltRank) => save(previous => ({ ...previous, belt }))
  const active = record.enrollments.filter(e => e.status === 'enrolled' || e.status === 'make-up')
  const check = (offering: ClassOffering, exclude?: string): string | null => {
    if (dateTime(offering).getTime() <= Date.now()) return 'This session has already started.'
    if (offering.occupied + (active.some(e => e.id === offering.id) ? 1 : 0) >= offering.capacity) return 'This class is full.'
    if (active.some(e => e.id !== exclude && classes.some(s => s.id === e.id && conflict(s, offering)))) return 'You are already enrolled in an overlapping session.'
    return null
  }
  const enroll = (offering: ClassOffering) => {
    const error = check(offering)
    if (error) return error
    if (record.enrollments.some(e => e.id === offering.id)) return 'You already have a record for this session.'
    save(previous => ({ ...previous, enrollments: [...previous.enrollments, { id: offering.id, status: 'enrolled' }] }))
    return null
  }
  const reschedule = (originalId: string, replacement: ClassOffering) => {
    const previous = active.find(e => e.id === originalId)
    if (!previous) return 'The original session is no longer enrolled.'
    if (originalId === replacement.id) return 'Choose a different session.'
    const error = check(replacement, originalId)
    if (error) return error
    if (record.enrollments.some(e => e.id === replacement.id)) return 'You already have a record for the selected session.'
    save(value => ({ ...value, enrollments: [
      ...value.enrollments.filter(e => e.id !== originalId),
      { id: replacement.id, status: 'make-up', movedFrom: originalId },
    ] }))
    return null
  }
  const cancel = (id: string) => save(value => ({ ...value, enrollments: value.enrollments.filter(e => e.id !== id) }))
  return { ...record, active, setBelt, enroll, reschedule, cancel, check }
}
