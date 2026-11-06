import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const { getRiskAssessment, getDecliningAssessments } = await server.ssrLoadModule('/src/lib/admin/attendance-risk.ts')

function daysAgo(days) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const student = { id: 'student-1', joinedAt: daysAgo(90) }

function history(...entries) {
  return {
    sessions: entries.map(([age], index) => ({ id: `session-${index}`, date: daysAgo(age), startTime: '10:00' })),
    records: entries.map(([, status], index) => ({ sessionId: `session-${index}`, studentId: student.id, status })),
  }
}

test('no booked class within 30 days needs follow-up, including missed or excused bookings as bookings', () => {
  const oldBooking = history([30, 'present'])
  const assessment = getRiskAssessment(student, oldBooking.records, oldBooking.sessions)
  assert.equal(assessment.level, 'at_risk')
  assert.deepEqual(assessment.reasons, ['No booked classes in the last 30 days'])

  for (const status of ['present', 'late', 'absent', 'excused']) {
    const recent = history([29, status])
    assert.equal(getRiskAssessment(student, recent.records, recent.sessions).level, 'healthy')
  }
})

test('new students with no bookings are not flagged solely for joining recently', () => {
  const newcomer = { ...student, joinedAt: daysAgo(10) }
  assert.equal(getRiskAssessment(newcomer, [], []).level, 'healthy')
  assert.equal(getDecliningAssessments([newcomer], [], []).length, 0)
})

test('two consecutive missed booked classes need follow-up regardless of attendance rate', () => {
  const { records, sessions } = history([1, 'absent'], [3, 'absent'], [5, 'present'])
  const assessment = getRiskAssessment(student, records, sessions)
  assert.equal(assessment.level, 'at_risk')
  assert.equal(assessment.consecutiveAbsences, 2)
  assert.deepEqual(assessment.reasons, ['2 consecutive missed booked classes'])
})

test('excused and present bookings break the missed-class streak', () => {
  for (const status of ['excused', 'present', 'late']) {
    const { records, sessions } = history([1, 'absent'], [3, status], [5, 'absent'])
    const assessment = getRiskAssessment(student, records, sessions)
    assert.equal(assessment.consecutiveAbsences, 1)
    assert.equal(assessment.level, 'healthy')
  }
})

test('unrecorded and future sessions do not count toward a missed-class streak', () => {
  const { records, sessions } = history([1, 'absent'], [2, 'excused'], [3, 'absent'])
  records[1].status = undefined
  sessions.push({ id: 'future', date: daysAgo(-1), startTime: '10:00' })
  records.push({ sessionId: 'future', studentId: student.id, status: 'absent' })
  assert.equal(getRiskAssessment(student, records, sessions).consecutiveAbsences, 1)
})

test.after(async () => server.close())
