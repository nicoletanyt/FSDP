import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { InstructorDataError, toInstructorDataError } from '@/lib/instructor/errors'
import { invalidateSessionChange, refreshInvalidatedSessionViews } from '@/lib/instructor/cache-invalidation'
import { queryGeneration } from '@/lib/query-generation'
import { protectSessionEdit } from '@/lib/instructor/edit-protection'
import type { AssessmentDetail, AssessmentKey, AssessmentSaveInput, ReportDetail, ReportSaveInput, SessionSaveInput } from '@/lib/instructor/types'

type Kind = 'report' | 'assessment'
type Detail<K extends Kind> = K extends 'report' ? ReportDetail : AssessmentDetail
type Draft = ({ kind: 'report' } & Pick<ReportSaveInput, 'report' | 'expected'>)
  | ({ kind: 'assessment' } & Pick<AssessmentSaveInput, 'status' | 'notes' | 'expected'>)

export function useInstructorSessionSave<K extends Kind>(kind: K, pair: AssessmentKey) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session, profile } = useAuth()
  const source = useRef({ api, revision: 0 })
  if (source.current.api !== api) source.current = { api, revision: source.current.revision + 1 }
  const key = JSON.stringify([session?.user.id, profile?.role, pair.eventId, pair.studentId, kind, source.current.revision])
  const current = useRef({ key, mounted: true })
  current.current.key = key
  const busy = useRef(false)
  const frozen = useRef<SessionSaveInput | null>(null)
  const controller = useRef<AbortController | null>(null)
  const releaseProtection = useRef<(() => void) | null>(null)
  const [fresh, setFresh] = useState<{ key: string; data: Detail<K> } | null>(null)
  const [state, setState] = useState<{ key: string; pending: boolean; error: string | null; retry: 'write' | 'read'; unconfirmed: boolean } | null>(null)
  useEffect(() => {
    current.current.mounted = true; busy.current = false; frozen.current = null
    return () => {
      current.current.mounted = false; controller.current?.abort()
      releaseProtection.current?.(); releaseProtection.current = null
    }
  }, [key])
  const active = state?.key === key ? state : null
  const isCurrent = () => current.current.mounted && current.current.key === key

  async function perform(input: SessionSaveInput | null): Promise<Detail<K> | null> {
    if (!isCurrent() || busy.current) return null
    busy.current = true
    let acknowledged = false
    const generation = queryGeneration(client)
    if (input && !releaseProtection.current) {
      releaseProtection.current = protectSessionEdit(client, { userId: input.expectedUserId, eventId: input.eventId, studentId: input.studentId, generation })
    }
    setState(previous => ({ key, pending: true, error: null, retry: 'read', unconfirmed: previous?.key === key && previous.unconfirmed }))
    try {
      if (input) {
        if (input.kind === 'report') await api.saveReport(input)
        else await api.saveAssessment(input)
        acknowledged = true
        invalidateSessionChange(client, generation, input.expectedUserId, input.eventId, [input.studentId], input.kind, false)
      }
      if (!isCurrent()) return null
      if (input) setState({ key, pending: true, error: null, retry: 'read', unconfirmed: true })
      const read = new AbortController(); controller.current = read
      const data = kind === 'report' ? await api.getReport(pair, read.signal) : await api.getAssessment(pair, read.signal)
      if (!data) throw new InstructorDataError('forbidden', 'This event/student record is no longer available to your account.')
      if (!isCurrent()) return null
      const impact = input ?? frozen.current
      if (impact) await refreshInvalidatedSessionViews(client, generation, impact.expectedUserId, impact.eventId, [impact.studentId], impact.kind)
      if (!isCurrent()) return null
      const result = data as Detail<K>
      setFresh({ key, data: result }); setState(null); frozen.current = null
      releaseProtection.current?.(); releaseProtection.current = null
      return result
    } catch (error) {
      if (input && !acknowledged) {
        invalidateSessionChange(client, generation, input.expectedUserId, input.eventId, [input.studentId], input.kind, false)
      }
      if (!isCurrent()) return null
      const failure = toInstructorDataError(error, 'Unable to save this record. Please retry.')
      setState(previous => ({ key, pending: false, retry: input && !acknowledged && failure.code === 'request_failed' ? 'write' : 'read',
        unconfirmed: acknowledged || (previous?.key === key && previous.unconfirmed)
          || Boolean(input && (failure.code === 'request_failed' || failure.code === 'conflict')),
        error: acknowledged ? `The record was saved, but could not be reloaded. ${failure.message}` : failure.message }))
      return null
    } finally { if (isCurrent()) busy.current = false }
  }

  function save(draft: Draft) {
    if (!isCurrent() || busy.current || active?.error || !session || profile?.role !== 'instructor' || draft.kind !== kind) return Promise.resolve(null)
    const input: SessionSaveInput = { ...draft, ...pair, expectedUserId: parseEntityId(session.user.id, 'auth-user'), requestId: crypto.randomUUID() }
    frozen.current = input
    return perform(input)
  }

  return { key, isCurrent, data: fresh?.key === key ? fresh.data : null, pending: active?.pending ?? false, error: active?.error ?? null,
    unconfirmed: active?.unconfirmed ?? false,
    retryMode: active?.retry ?? 'read',
    retryLabel: active?.retry === 'write' ? 'Retry save' : 'Reload saved record', save,
    retry: () => perform(active?.retry === 'write' ? frozen.current : null), reload: () => perform(null) }
}
