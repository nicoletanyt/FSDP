import assert from 'node:assert/strict'
import test from 'node:test'
import { signInToStaffPortal, signInToStudentPortal, StaffPortalRoleError, StudentPortalRoleError } from '../src/lib/portal-sign-in.ts'

function clients({ role = 'student', authError = null, profileError = null, sessionError = null, profileId = 'user-1' } = {}) {
  const calls = { signIn: [], profiles: [], setSession: [], signOut: [] }
  const session = { user: { id: 'user-1' }, access_token: 'access', refresh_token: 'refresh' }
  const candidate = {
    auth: {
      async signInWithPassword(credentials) {
        calls.signIn.push(credentials)
        return { data: { session: authError ? null : session }, error: authError }
      },
      async signOut(options) { calls.signOut.push(options); return { error: null } },
    },
    from(table) {
      calls.profiles.push(table)
      return {
        select(fields) {
          calls.profiles.push(fields)
          return {
            eq(column, value) {
              calls.profiles.push([column, value])
              return { async single() { return { data: profileError ? null : { id: profileId, role }, error: profileError } } }
            },
          }
        },
      }
    },
  }
  const primary = {
    auth: {
      async setSession(tokens) {
        calls.setSession.push(tokens)
        return { error: sessionError }
      },
    },
  }
  return { candidate, primary, calls }
}

test('student portal transfers only a verified student session', async () => {
  const { candidate, primary, calls } = clients()
  await signInToStudentPortal(candidate, primary, 'student@example.test', 'password')
  assert.deepEqual(calls.signIn, [{ email: 'student@example.test', password: 'password' }])
  assert.deepEqual(calls.profiles, ['users', 'id, role', ['id', 'user-1']])
  assert.deepEqual(calls.setSession, [{ access_token: 'access', refresh_token: 'refresh' }])
  assert.deepEqual(calls.signOut, [])
})

for (const role of ['instructor', 'administrator']) {
  test(`${role} credentials cannot open a student-portal session`, async () => {
    const { candidate, primary, calls } = clients({ role })
    await assert.rejects(signInToStudentPortal(candidate, primary, 'staff@example.test', 'password'), StudentPortalRoleError)
    assert.deepEqual(calls.setSession, [])
    assert.deepEqual(calls.signOut, [{ scope: 'local' }])
  })
}

test('invalid credentials and missing profiles do not open a student-portal session', async () => {
  const authError = new Error('Invalid login credentials')
  const invalid = clients({ authError })
  await assert.rejects(signInToStudentPortal(invalid.candidate, invalid.primary, 'wrong@example.test', 'wrong'), authError)
  assert.deepEqual(invalid.calls.setSession, [])

  for (const options of [{ profileError: new Error('Profile unavailable') }, { profileId: 'different-user' }]) {
    const { candidate, primary, calls } = clients(options)
    await assert.rejects(signInToStudentPortal(candidate, primary, 'student@example.test', 'password'), /Unable to verify account access/)
    assert.deepEqual(calls.setSession, [])
    assert.deepEqual(calls.signOut, [{ scope: 'local' }])
  }
})

test('session transfer failure does not report successful sign-in', async () => {
  const { candidate, primary, calls } = clients({ sessionError: new Error('Session rejected') })
  await assert.rejects(signInToStudentPortal(candidate, primary, 'student@example.test', 'password'), /Unable to sign in/)
  assert.deepEqual(calls.signOut, [{ scope: 'local' }])
})

for (const role of ['instructor', 'administrator']) {
  test(`${role} credentials can open a staff-portal session`, async () => {
    const { candidate, primary, calls } = clients({ role })
    await signInToStaffPortal(candidate, primary, 'staff@example.test', 'password')
    assert.deepEqual(calls.profiles, ['users', 'id, role', ['id', 'user-1']])
    assert.deepEqual(calls.setSession, [{ access_token: 'access', refresh_token: 'refresh' }])
    assert.deepEqual(calls.signOut, [])
  })
}

test('student credentials cannot open a staff-portal session', async () => {
  const { candidate, primary, calls } = clients()
  await assert.rejects(signInToStaffPortal(candidate, primary, 'student@example.test', 'password'), StaffPortalRoleError)
  assert.deepEqual(calls.setSession, [])
  assert.deepEqual(calls.signOut, [{ scope: 'local' }])
})

test('staff portal rejects missing or mismatched profiles and session transfer failures', async () => {
  for (const options of [
    { role: 'instructor', profileError: new Error('Unavailable') },
    { role: 'instructor', profileId: 'another-user' },
    { role: 'administrator', sessionError: new Error('Session rejected') },
  ]) {
    const { candidate, primary, calls } = clients(options)
    await assert.rejects(signInToStaffPortal(candidate, primary, 'staff@example.test', 'password'))
    assert.equal(calls.setSession.length, options.sessionError ? 1 : 0)
    assert.deepEqual(calls.signOut, [{ scope: 'local' }])
  }
})
