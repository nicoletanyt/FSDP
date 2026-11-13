import type { SupabaseClient } from '@supabase/supabase-js'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }
export type ChatSource = { label: string; href: string }
export type ChatReply = { reply: string; sources: ChatSource[] }

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
      && /^\/instructor\/(?:students(?:\/[0-9a-f-]{36})?|calendar\?date=\d{4}-\d{2}-\d{2})$/i.test(source.href)).slice(0, 10)
    return { reply: data.reply, sources }
  }
}
