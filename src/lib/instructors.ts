import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { InstructorTitle } from './instructor/titles'

interface InstructorDetails {
  first_name: string
  last_name: string
  email: string
  grade_id: string
  instructor_title: InstructorTitle
  is_examiner: boolean
}

export interface InstructorAccount {
  id: string
  email: string
  password: string
  email_status: 'accepted' | 'failed' | 'uncertain'
}

export function instructorEmailMessage(status: InstructorAccount['email_status']): string {
  if (status === 'accepted') return 'EmailJS accepted the login email. This does not confirm delivery to the instructor.'
  if (status === 'failed') return 'EmailJS rejected the login email. The account already exists—do not create it again. Share the credentials securely.'
  return 'The email outcome is uncertain. The account already exists—do not create it again. Check EmailJS history and the instructor’s inbox before sharing the credentials.'
}

export async function createInstructor(details: InstructorDetails) {
  const { data, error } = await supabase.functions.invoke<InstructorAccount>(
    'create-instructor', { body: details },
  )
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body: unknown = await error.context.json().catch(() => null)
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        throw new Error(body.error)
      }
    }
    throw new Error('Unable to create the instructor. Please try again.')
  }
  if (!data?.id || typeof data.email !== 'string' || typeof data.password !== 'string' || !data.password ||
    !['accepted', 'failed', 'uncertain'].includes(data.email_status)) {
    throw new Error('The instructor account credentials could not be confirmed.')
  }
  return data
}
