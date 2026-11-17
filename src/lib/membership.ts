export type MembershipType = 'adult' | 'junior' | 'student' | 'senior'

export type ClassPassAudience = 'adult' | 'junior'

export const MEMBERSHIP_TYPES: {
  value: MembershipType
  label: string
  description: string
  /** Inclusive age range (age today); maxAge null means no upper limit. */
  minAge: number
  maxAge: number | null
}[] = [
  { value: 'adult', label: 'Adult (13+)', description: 'Standard adult class passes', minAge: 13, maxAge: null },
  { value: 'junior', label: 'Junior (4-12)', description: 'Children class passes', minAge: 4, maxAge: 12 },
  {
    value: 'student',
    label: 'Student (Full-time, 17-25)',
    description: '50% off adult class passes with valid full-time student ID',
    minAge: 17,
    maxAge: 25,
  },
  { value: 'senior', label: 'Senior (65+)', description: 'Adult class passes for senior members', minAge: 65, maxAge: null },
]

/** Whether someone of this age can choose this membership type. Unknown age allows all. */
export function membershipTypeAllowed(value: string, age: number | null) {
  const type = MEMBERSHIP_TYPES.find((item) => item.value === value)
  if (!type) return false
  if (age === null) return true
  return age >= type.minAge && (type.maxAge === null || age <= type.maxAge)
}

export const MEMBERSHIP_TYPE_STORAGE_KEY = 'user_membership_type'
export const DATE_OF_BIRTH_STORAGE_KEY = 'user_dob'

export function membershipLabel(value: string) {
  return MEMBERSHIP_TYPES.find((type) => type.value === value)?.label ?? value
}

export function calculateAge(dateOfBirth: string): number | null {
  const birthDate = new Date(dateOfBirth)
  if (Number.isNaN(birthDate.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}

/**
 * Membership type selected during the membership application takes priority.
 * Date of birth is only used as a fallback for older accounts.
 */
export function resolveMembershipType(): MembershipType {
  const saved = localStorage.getItem(MEMBERSHIP_TYPE_STORAGE_KEY)
  if (saved === 'adult' || saved === 'junior' || saved === 'student' || saved === 'senior') {
    return saved
  }

  const age = calculateAge(localStorage.getItem(DATE_OF_BIRTH_STORAGE_KEY) ?? '')
  if (age === null) return 'adult'
  if (age < 13) return 'junior'
  if (age >= 65) return 'senior'
  return 'adult'
}

export function classPassAudience(type: MembershipType): ClassPassAudience {
  return type === 'junior' ? 'junior' : 'adult'
}

export function isStudentMembership(type: MembershipType) {
  return type === 'student'
}
