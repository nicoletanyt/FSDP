import GradeBadge from '@/components/GradeBadge'
import type { Grade, GradeTrack, RankedGrade } from '@/lib/admin/types'
import type { RankId } from '@/lib/student-grades'

const ranks = {
  'Red (12th Kyu)': '12-kyu',
  'Red-Gold (11th Kyu)': '11-kyu',
  'Yellow (10th Kyu)': '10-kyu',
  'Orange (9th Kyu)': '9-kyu',
  'Green (8th Kyu)': '8-kyu',
  'Purple (7th Kyu)': '7-kyu',
  'Blue (6th Kyu)': '6-kyu',
  'Blue-Silver (6th Kyu)': '6-kyu-silver',
  'Blue-Gold (5th Kyu)': '5-kyu',
  'Brown (4th Kyu)': '4-kyu',
  'Brown-Silver (4th Kyu)': '4-kyu-silver',
  'Brown-Gold (3rd Kyu)': '3-kyu',
  'Black (2nd Kyu)': '2-kyu',
  'Black-Silver (2nd Kyu)': '2-kyu-silver',
  'Black-Gold (1st Kyu)': '1-kyu',
  'Junior Dan': 'junior-dan',
  '1st Dan': '1-dan',
  '2nd Dan': '2-dan',
  '3rd Dan': '3-dan',
  '4th Dan': '4-dan',
} satisfies Record<RankedGrade, RankId>

export default function AdminGradeBadge({ grade, track }: { grade: Grade; track: GradeTrack }) {
  if (grade === 'Unranked') {
    return <span className="inline-flex rounded-md border bg-background px-2 py-0.5 text-2xs font-semibold">Unranked</span>
  }

  return <GradeBadge rank={ranks[grade]} system={track === 'adult' ? 'adults' : 'children'} />
}
