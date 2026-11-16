import type { SupabaseClient } from '@supabase/supabase-js'

export class StudentPortalRoleError extends Error {
  constructor() {
    super('This is a staff account. Sign in through the staff portal instead.')
  }
}

export class StaffPortalRoleError extends Error {
  constructor() {
    super('This is a student account. Sign in through the student portal instead.')
  }
}

async function signInToPortal(
  candidate: SupabaseClient,
  primary: SupabaseClient,
  email: string,
  password: string,
  portal: 'student' | 'staff',
) {
  const { data, error } = await candidate.auth.signInWithPassword({ email, password })
  if (error) throw error

  const session = data.session
  if (!session) throw new Error('Unable to sign in. Try again.')

  try {
    const { data: profile, error: profileError } = await candidate.from('users')
      .select('id, role').eq('id', session.user.id).single()
    if (profileError || !profile || profile.id !== session.user.id) {
      throw new Error('Unable to verify account access. Try again.')
    }
    if (portal === 'student' && profile.role !== 'student') throw new StudentPortalRoleError()
    if (portal === 'staff' && profile.role !== 'instructor' && profile.role !== 'administrator') {
      throw new StaffPortalRoleError()
    }

    const { error: sessionError } = await primary.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    if (sessionError) throw new Error('Unable to sign in. Try again.')
  } catch (failure) {
    // The temporary client never stores a session in the browser. Clear only
    // its local session, not the user's other devices or the persistent client.
    try {
      await candidate.auth.signOut({ scope: 'local' })
    } catch {
      // The unpersisted candidate cannot affect the primary session.
    }
    throw failure
  }
}

export function signInToStudentPortal(
  candidate: SupabaseClient, primary: SupabaseClient, email: string, password: string,
) {
  return signInToPortal(candidate, primary, email, password, 'student')
}

export function signInToStaffPortal(
  candidate: SupabaseClient, primary: SupabaseClient, email: string, password: string,
) {
  return signInToPortal(candidate, primary, email, password, 'staff')
}
