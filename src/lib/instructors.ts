import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface InstructorDetails {
  first_name: string
  last_name: string
  email: string
}

export interface InstructorAccount {
  id: string
  email: string
  password: string
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
  if (!data?.id || typeof data.email !== 'string' || typeof data.password !== 'string' || !data.password) {
    throw new Error('The instructor account credentials could not be confirmed.')
  }
  return data
}
