// Run locally with the root .env; never put SUPABASE_SERVICE_ROLE_KEY in a browser.
// issue MEMBER_NO https://your-frontend.example
// revoke MEMBER_NO TAG_TOKEN       or revoke-all MEMBER_NO
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const [action, memberNo, argument] = process.argv.slice(2)
const usage = 'Usage: node --env-file=.env scripts/nfc-tags.mjs issue MEMBER_NO https://frontend.example\n' +
  '   or: node --env-file=.env scripts/nfc-tags.mjs revoke MEMBER_NO TAG_TOKEN\n' +
  '   or: node --env-file=.env scripts/nfc-tags.mjs revoke-all MEMBER_NO'
const tagPattern = /^[0-9a-f]{64}$/i
const httpTestOrigin = 'http://192.168.1.13:5173'
const digest = (token) => createHash('sha256').update(token.toLowerCase()).digest('hex')

async function main() {
  if (!memberNo || !['issue', 'revoke', 'revoke-all'].includes(action)) throw new Error(usage)
  if (action === 'issue' && !argument || action === 'revoke' && !tagPattern.test(argument ?? '')) {
    throw new Error(usage)
  }
  const url = action === 'issue' ? new URL(argument) : null
  if (url && (!(url.protocol === 'https:' ||
      process.env.FSDP_ALLOW_HTTP_NFC_TEST === '1' && url.origin === httpTestOrigin) ||
      url.pathname !== '/' || url.search || url.hash ||
      url.username || url.password)) {
    throw new Error('Use only the HTTPS origin of your frontend (without a path or query).')
  }
  const project = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!project || !key) throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.')
  const db = createClient(project, key, { auth: { persistSession: false } })
  const { data: student, error: studentError } = await db.from('students')
    .select('id').eq('member_no', memberNo).single()
  if (studentError || !student) throw new Error('Student member number not found.')

  if (action === 'issue') {
    const token = randomBytes(32).toString('hex')
    const { error } = await db.from('student_nfc_tags').insert({ student_id: student.id, tag_id: digest(token) })
    if (error) throw new Error('Unable to issue an NFC tag.')
    console.log(`${url.origin}/instructor/nfc_checkin?tag=${token}`)
    console.log('Keep this URL private; it will not be shown again. Save it as an NFC URI record.')
    return
  }

  let deletion = db.from('student_nfc_tags').delete().eq('student_id', student.id)
  if (action === 'revoke') deletion = deletion.eq('tag_id', digest(argument))
  const { data, error } = await deletion.select('tag_id')
  if (error) throw new Error('Unable to revoke the tag.')
  console.log(`Revoked ${data?.length ?? 0} tag(s).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'NFC tag command failed.')
  process.exitCode = 1
})
