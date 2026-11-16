// Read-only diagnostic: uses the same Vite development env precedence as the
// app, and never logs the server credential or any private Membership fields.
import { loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env }
const [memberNo, expectedGrade] = process.argv.slice(2)
if (!memberNo || !env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Usage: node scripts/verify-membership-grade.mjs MEMBER_NO [EXPECTED_GRADE_ID]. Server-side Supabase configuration is required.')
  process.exit(1)
}
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
try {
  const { data: student, error } = await db.from('students')
    .select('id,member_no,current_grade_id,grade:grades!students_current_grade_id_fkey(label,colour)')
    .eq('member_no', memberNo).single()
  if (error) throw error
  const { data: readiness, error: readinessError } = await db.rpc('student_grading_readiness', { target_student: student.id })
  if (readinessError) throw readinessError
  const next = readiness?.[0]
  let fee = null
  if (next) {
    const { data, error: feeError } = await db.from('grade_requirements').select('fee_cents')
      .eq('grade_id', next.target_grade_id).eq('track', next.track).single()
    if (feeError) throw feeError
    fee = data.fee_cents
  }
  const grade = Array.isArray(student.grade) ? student.grade[0] : student.grade
  console.log(JSON.stringify({
    project: new URL(env.VITE_SUPABASE_URL).hostname,
    member_no: student.member_no,
    current_grade_id: student.current_grade_id,
    current_grade: grade?.label ?? null,
    target_grade_id: next?.target_grade_id ?? null,
    target_grade: next?.target_grade_label ?? null,
    grading_track: next?.track ?? null,
    base_fee_cents: fee,
    requirements: (readiness ?? []).map(row => ({ key: row.key, required: row.required, met: row.met })),
  }, null, 2))
  if (expectedGrade && student.current_grade_id !== expectedGrade) {
    throw new Error('The database grade does not match the expected saved Membership grade.')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error?.message ?? 'Membership verification failed.')
  process.exitCode = 1
}
