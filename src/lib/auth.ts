export const userRoles = ['administrator', 'instructor', 'student'] as const

export type UserRole = typeof userRoles[number]

export interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
  created_at: string
}

export const dashboardPaths: Record<UserRole, string> = {
  administrator: '/admin',
  instructor: '/instructor',
  student: '/dashboard',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && userRoles.some((role) => role === value)
}
