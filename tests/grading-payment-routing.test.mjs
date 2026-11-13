import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('student Grading entry opens payment without depending on available opportunities', async () => {
  const app = await read('src/App.tsx')
  assert.match(app, /path="grading" element=\{<GradingPayment \/>\}/)
  assert.match(app, /path="grading\/payment" element=\{<GradingPayment \/>\}/)
  assert.match(app, /path="grading\/applications" element=\{<StudentGrading \/>\}/)
  const navigation = await read('src/components/student/StudentNavigation.tsx')
  assert.match(navigation, /label: 'Grading', to: '\/grading'/)
  const payment = await read('src/pages/Student/GradingPayment.tsx')
  assert.equal((payment.match(/to="\/grading\/applications"/g) ?? []).length, 2)
})
