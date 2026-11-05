export type InstructorDataErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'instructor_not_found'
  | 'invalid_data'
  | 'invalid_request'
  | 'cancelled'
  | 'request_failed'

export class InstructorDataError extends Error {
  readonly code: InstructorDataErrorCode

  constructor(code: InstructorDataErrorCode, message: string) {
    super(message)
    this.name = 'InstructorDataError'
    this.code = code
  }
}

export function toInstructorDataError(error: unknown, message: string): InstructorDataError {
  if (error instanceof InstructorDataError) return error
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : null
    const status = 'status' in error ? error.status : null
    const name = 'name' in error ? error.name : null
    if (name === 'AbortError') return new InstructorDataError('cancelled', 'The instructor data request was cancelled.')
    if (code === '22023') return new InstructorDataError('invalid_request', 'The instructor data request contains invalid filters.')
    if (name === 'AuthSessionMissingError' || status === 401 || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
      return new InstructorDataError('unauthenticated', 'Your session has expired. Sign in again.')
    }
    if (status === 403 || code === '42501') {
      return new InstructorDataError('forbidden', 'You do not have permission to access these instructor records.')
    }
  }
  // Keep database details and transport internals out of user-facing messages.
  return new InstructorDataError('request_failed', message)
}
