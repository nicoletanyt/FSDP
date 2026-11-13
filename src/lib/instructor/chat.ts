import type { SupabaseClient } from '@supabase/supabase-js'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatSource = { label: string; href: string }
// Confirm-before-write proposals. The server never writes; the browser performs a
// confirmed action through InstructorApi with the instructor's own session.
export type ChatAction =
  | { kind: 'endorse_student'; studentId: string; targetGradeId: string; label: string }
  | { kind: 'mark_attendance'; eventId: string; studentId: string; status: 'present' | 'absent'; label: string }
export type ChatReply = { reply: string; sources: ChatSource[]; actions: ChatAction[] }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sourcePattern = /^\/instructor\/(?:students(?:\/[0-9a-f-]{36})?|gradings(?:\/[0-9a-f-]{36})?|calendar\?date=\d{4}-\d{2}-\d{2})$/i

export function chatActions(value: unknown): ChatAction[] {
  if (!Array.isArray(value)) return []
  const actions: ChatAction[] = []
  for (const item of value.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    if (!label || label.length > 120 || typeof row.student_id !== 'string' || !uuidPattern.test(row.student_id)) continue
    if (row.kind === 'endorse_student' && typeof row.target_grade_id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(row.target_grade_id)) {
      actions.push({ kind: 'endorse_student', studentId: row.student_id, targetGradeId: row.target_grade_id, label })
    } else if (row.kind === 'mark_attendance' && typeof row.event_id === 'string' && uuidPattern.test(row.event_id)
        && (row.status === 'present' || row.status === 'absent')) {
      actions.push({ kind: 'mark_attendance', eventId: row.event_id, studentId: row.student_id, status: row.status, label })
    }
  }
  return actions
}

// Keep recent conversation only. The backend never accepts client system/tool
// messages, and re-reads database facts for each question.
export function chatHistory(messages: ChatTurn[]): ChatTurn[] {
  const turns = messages.map(({ role, content }) => ({ role, content: content.slice(0, 4000) })).slice(-19)
  while (turns.length > 1 && (turns.reduce((length, turn) => length + turn.content.length, 0) > 16_000
    || new TextEncoder().encode(JSON.stringify({ messages: turns })).length > 28_000)) turns.shift()
  return turns
}

export function createInstructorChatClient(client: Pick<SupabaseClient, 'auth' | 'functions'>) {
  return async (expectedUserId: string, messages: ChatTurn[], signal: AbortSignal): Promise<ChatReply> => {
    signal.throwIfAborted()
    const { data: { session }, error: sessionError } = await client.auth.getSession()
    if (sessionError || !session || session.user.id !== expectedUserId) throw new Error('Your account changed or session expired. Please sign in again.')
    signal.throwIfAborted()
    const { data, error } = await client.functions.invoke('instructor-chat', {
      body: { messages: chatHistory(messages) }, signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    signal.throwIfAborted()
    if (error) {
      if (error.context instanceof Response) {
        const body = await error.context.json().catch(() => null)
        if (typeof body?.error === 'string' && body.error.length < 500) throw new Error(body.error)
      }
      throw new Error('Unable to reach instructor chat. Check your connection and try again.')
    }
    if (!data || typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 12_000 || !Array.isArray(data.sources)) {
      throw new Error('The chat returned an invalid reply. Please retry.')
    }
    // Render only known internal source routes, never URLs suggested by a model.
    const sources: ChatSource[] = data.sources.filter((source: ChatSource) => source && typeof source.label === 'string'
      && source.label.length <= 200 && typeof source.href === 'string'
      && sourcePattern.test(source.href)).slice(0, 10)
    return { reply: data.reply, sources, actions: chatActions(data.actions) }
  }
}
