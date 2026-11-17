import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Membership selects canonical database grade IDs and submits the selected ID, not a colour-only placeholder', async () => {
  const source = await readFile(new URL('../src/pages/Student/ApplyMembership.tsx', import.meta.url), 'utf8')
  // Grades are read from the database catalogue (cached query), not hard-coded.
  assert.match(source, /\.from\(["']grades["']\)/)
  assert.match(source, /const gradeCatalogue = gradeQuery\.data \?\? \[\]/)
  // Options come from the catalogue for the date-of-birth track, and their values are grade IDs.
  assert.match(source, /membershipBeltOptions\(gradeCatalogue, gradingTrack\)/)
  assert.match(source, /options=\{belts\}/)
  // The selected ID is submitted (beginners who haven't trained submit "unranked").
  assert.match(source, /current_grade_id: trained \? formData\.currentBelt : "unranked"/)
  // Validation only accepts an option from that list.
  assert.match(source, /belts\.some\(\(?belt\)? => belt\.value === formData\.currentBelt\)/)
  assert.doesNotMatch(source, /const BELTS =/)
})
