import { useEffect, useRef, useState } from 'react'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { InstructorDataError, toInstructorDataError } from '@/lib/instructor/errors'
import type { AssessmentDetail, AssessmentKey, AssessmentSaveInput, ReportDetail, ReportSaveInput, SessionSaveInput } from '@/lib/instructor/types'

type Kind = 'report' | 'assessment'
type Detail<K extends Kind> = K extends 'report' ? ReportDetail : AssessmentDetail
type Draft = ({ kind: 'report' } & Pick<ReportSaveInput, 'report' | 'expected'>)
  | ({ kind: 'assessment' } & Pick<AssessmentSaveInput, 'status' | 'notes' | 'expected'>)

export function useInstructorSessionSave<K extends Kind>(kind: K, pair: AssessmentKey) {
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const source = useRef({ api, revision: 0 })
  if (source.current.api !== api) source.current = { api, revision: source.current.revision + 1 }
  const key = JSON.stringify([session?.user.id, profile?.role, pair.eventId, pair.studentId, kind, source.current.revision])
  const current = useRef({ key, mounted: true })
  current.current.key = key
  const busy = useRef(false)
  const frozen = useRef<SessionSaveInput | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [fresh, setFresh] = useState<{ key: string; data: Detail<K> } | null>(null)
  const [state, setState] = useState<{ key: string; pending: boolean; error: string | null; retry: 'write' | 'read' } | null>(null)
  useEffect(() => {
    current.current.mounted = true; busy.current = false; frozen.current = null
    return () => { current.current.mounted = false; controller.current?.abort() }
  }, [key])
  const active = state?.key === key ? state : null
  const isCurrent = () => current.current.mounted && current.current.key === key

  async function perform(input: SessionSaveInput | null): Promise<Detail<K> | null> {
    if (!isCurrent() || busy.current) return null
    busy.current = true
    let acknowledged = false
    setState({ key, pending: true, error: null, retry: 'read' })
    try {
      if (input) {
        if (input.kind === 'report') await api.saveReport(input)
        else await api.saveAssessment(input)
        acknowledged = true
      }
      if (!isCurrent()) return null
      const read = new AbortController(); controller.current = read
      const data = kind === 'report' ? await api.getReport(pair, read.signal) : await api.getAssessment(pair, read.signal)
      if (!data) throw new InstructorDataError('forbidden', 'This event/student record is no longer available to your account.')
      if (!isCurrent()) return null
      const result = data as Detail<K>
      setFresh({ key, data: result }); setState(null); frozen.current = null
      return result
    } catch (error) {
      if (!isCurrent()) return null
      const failure = toInstructorDataError(error, 'Unable to save this record. Please retry.')
      setState({ key, pending: false, retry: input && !acknowledged && failure.code === 'request_failed' ? 'write' : 'read',
        error: acknowledged ? `The record was saved, but could not be reloaded. ${failure.message}` : failure.message })
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
    retryMode: active?.retry ?? 'read',
    retryLabel: active?.retry === 'write' ? 'Retry save' : 'Reload saved record', save,
    retry: () => perform(active?.retry === 'write' ? frozen.current : null), reload: () => perform(null) }
}
