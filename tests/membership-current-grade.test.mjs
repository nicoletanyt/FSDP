import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Membership selects canonical database grade IDs and submits the selected ID, not a colour-only placeholder', async () => {
  const source = await readFile(new URL('../src/pages/Student/ApplyMembership.tsx', import.meta.url), 'utf8')
  assert.match(source, /supabase\.from\('grades'\)/)
  assert.match(source, /setGradeCatalogue\(data \?\? \[\]\)/)
  assert.match(source, /membershipBeltOptions\(gradeCatalogue, gradingTrack\)/)
  assert.match(source, /value=\{option\.value\}/)
  assert.match(source, /current_grade_id: formData\.currentBelt/)
  assert.match(source, /belts\.some\(belt => belt\.value === formData\.currentBelt\)/)
  assert.doesNotMatch(source, /const BELTS =/)
})
