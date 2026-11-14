import { supabase } from '@/lib/supabase'
import type { UserProfile } from '@/lib/auth'
import type { GradeRow } from '@/lib/instructor/types'

export type InstructorProfile = Pick<UserProfile, 'id' | 'first_name' | 'last_name' | 'email'> & {
  instructors: { id: string; is_examiner: boolean; grade: GradeRow | null } | null
}

export const instructorDirectoryKey = (userId: string | undefined) =>
  ['admin', 'instructor-directory', userId] as const

export async function loadInstructorDirectory(): Promise<InstructorProfile[]> {
  const { data, error } = await supabase.from('users')
    .select('id, first_name, last_name, email, instructors(id, is_examiner, grade:grades(id, label, colour, is_ranked, sort_order))')
    .eq('role', 'instructor')
    .order('first_name')
    .order('last_name')
  if (error) throw new Error('Unable to load instructor accounts. Try again.')
  return (data ?? []) as unknown as InstructorProfile[]
}
