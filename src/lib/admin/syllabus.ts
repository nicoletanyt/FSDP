import type { Grade, GradeTrack, RankedGrade } from './types'

/**
 * Technique syllabus transcribed from the club's three syllabus sheets:
 *
 * - `children syllabus 1_(October2014).pdf` — 12th Kyu (Red) to 6th Kyu (Blue)
 * - `children syllabus 2_(October2014).pdf` — 6th Kyu (Blue-Silver) to 2nd Kyu (Black-Silver)
 * - `adult syllabus.pdf` — Blue (6th Kyu) to 4th Dan, revised January 2021
 *
 * Cells are quoted verbatim. Where a printed cell lists several drills,
 * attacks or directions, it is split into atomic checklist items so an
 * instructor can sign off "ikkyo vs yokomenuchi" separately from "ikkyo vs
 * ushiro ryotedori".
 */

export type SyllabusPartId = 'children-1' | 'children-2' | 'adult'

export type SyllabusColumnId =
  | 'breakfall'
  | 'ki-exercise'
  | 'movement'
  | 'attack'
  | 'basics'
  | 'ikkyo'
  | 'nikyo'
  | 'sankyo'
  | 'yonkyo'
  | 'gokyo'
  | 'iriminage'
  | 'shihonage'
  | 'kokyunage'
  | 'tenchinage'
  | 'kotegaishi'
  | 'kaitennage'
  | 'jujinage'
  | 'jujigarami'
  | 'koshinage'
  | 'jiyuwaza'
  | 'kokyuho'
  | 'jo-waza'
  | 'ken-waza'
  | 'tanto-waza'

export type SyllabusGroup = 'body' | 'technique' | 'free' | 'weapon'

export interface SyllabusColumn {
  id: SyllabusColumnId
  label: string
  group: SyllabusGroup
}

export interface SyllabusItem {
  /** Stable across re-orders: `grade/column/item`. */
  id: string
  grade: RankedGrade
  track: GradeTrack
  column: SyllabusColumnId
  label: string
  note?: string
  /** The full printed cell this item came from. */
  source: string
}

export interface SyllabusCell {
  column: SyllabusColumnId
  source: string
  /** Columns spanned by a merged printed cell (Yudansha rows). */
  span?: number
  items: SyllabusItem[]
}

export interface GradeSyllabus {
  grade: RankedGrade
  track: GradeTrack
  part: SyllabusPartId
  cells: SyllabusCell[]
}

export interface SyllabusPart {
  id: SyllabusPartId
  title: string
  subtitle: string
  track: GradeTrack
  columns: SyllabusColumn[]
  notes: string[]
  rows: GradeSyllabus[]
}

interface RawCell {
  column: SyllabusColumnId
  source: string
  /** `Label|note` per atomic item. Defaults to the printed cell as one item. */
  items?: string[]
  span?: number
}

interface RawRow {
  grade: RankedGrade
  cells: RawCell[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildRow(part: SyllabusPartId, track: GradeTrack, row: RawRow): GradeSyllabus {
  const gradeSlug = slugify(row.grade)
  return {
    grade: row.grade,
    track,
    part,
    cells: row.cells.map((cell) => ({
      column: cell.column,
      source: cell.source,
      span: cell.span,
      items: (cell.items ?? [cell.source]).map((entry) => {
        const [label, note] = entry.split('|')
        return {
          id: `${track}/${gradeSlug}/${cell.column}/${slugify(`${label} ${note ?? ''}`)}`,
          grade: row.grade,
          track,
          column: cell.column,
          label,
          note,
          source: cell.source,
        }
      }),
    })),
  }
}

const childrenPart1Columns: SyllabusColumn[] = [
  { id: 'breakfall', label: 'Breakfall', group: 'body' },
  { id: 'ki-exercise', label: 'Ki-Exercise', group: 'body' },
  { id: 'movement', label: 'Movement', group: 'body' },
  { id: 'attack', label: 'Attack', group: 'body' },
  { id: 'ikkyo', label: 'Ikkyo', group: 'technique' },
  { id: 'nikyo', label: 'Nikyo', group: 'technique' },
  { id: 'iriminage', label: 'Iriminage', group: 'technique' },
  { id: 'shihonage', label: 'Shihonage', group: 'technique' },
  { id: 'kokyunage', label: 'Kokyunage', group: 'technique' },
  { id: 'tenchinage', label: 'Tenchinage', group: 'technique' },
  { id: 'kotegaishi', label: 'Kotegaishi', group: 'technique' },
  { id: 'jujinage', label: 'Jujinage', group: 'technique' },
  { id: 'jiyuwaza', label: 'Jiyuwaza', group: 'free' },
  { id: 'kokyuho', label: 'Kokyuho', group: 'body' },
  { id: 'jo-waza', label: 'Jo Waza', group: 'weapon' },
]

const childrenPart2Columns: SyllabusColumn[] = [
  { id: 'movement', label: 'Movement', group: 'body' },
  { id: 'ikkyo', label: 'Ikkyo', group: 'technique' },
  { id: 'nikyo', label: 'Nikyo', group: 'technique' },
  { id: 'sankyo', label: 'Sankyo', group: 'technique' },
  { id: 'yonkyo', label: 'Yonkyo', group: 'technique' },
  { id: 'gokyo', label: 'Gokyo', group: 'technique' },
  { id: 'iriminage', label: 'Iriminage', group: 'technique' },
  { id: 'shihonage', label: 'Shihonage', group: 'technique' },
  { id: 'kokyunage', label: 'Kokyunage', group: 'technique' },
  { id: 'tenchinage', label: 'Tenchinage', group: 'technique' },
  { id: 'kotegaishi', label: 'Kotegaishi', group: 'technique' },
  { id: 'kaitennage', label: 'Kaitennage', group: 'technique' },
  { id: 'jujinage', label: 'Jujinage', group: 'technique' },
  { id: 'jiyuwaza', label: 'Jiyuwaza', group: 'free' },
  { id: 'jo-waza', label: 'Jo Waza', group: 'weapon' },
  { id: 'ken-waza', label: 'Ken Waza', group: 'weapon' },
]

const adultColumns: SyllabusColumn[] = [
  { id: 'basics', label: 'Basics', group: 'body' },
  { id: 'ikkyo', label: 'Ikkyo', group: 'technique' },
  { id: 'nikyo', label: 'Nikyo', group: 'technique' },
  { id: 'sankyo', label: 'Sankyo', group: 'technique' },
  { id: 'yonkyo', label: 'Yonkyo', group: 'technique' },
  { id: 'gokyo', label: 'Gokyo', group: 'technique' },
  { id: 'iriminage', label: 'Iriminage', group: 'technique' },
  { id: 'shihonage', label: 'Shihonage', group: 'technique' },
  { id: 'kokyunage', label: 'Kokyunage', group: 'technique' },
  { id: 'tenchinage', label: 'Techinage', group: 'technique' },
  { id: 'kotegaishi', label: 'Kotegaishi', group: 'technique' },
  { id: 'kaitennage', label: 'Kaitennage', group: 'technique' },
  { id: 'jujinage', label: 'Jujinage', group: 'technique' },
  { id: 'jujigarami', label: 'Jujigarami', group: 'technique' },
  { id: 'koshinage', label: 'Koshinage', group: 'technique' },
  { id: 'jiyuwaza', label: 'Jiyuwaza', group: 'free' },
  { id: 'jo-waza', label: 'Jo Waza', group: 'weapon' },
  { id: 'ken-waza', label: 'Ken Waza', group: 'weapon' },
  { id: 'tanto-waza', label: 'Tanto Waza', group: 'weapon' },
]

const childrenPart1Rows: RawRow[] = [
  {
    grade: 'Red (12th Kyu)',
    cells: [
      {
        column: 'breakfall',
        source: 'Forward Roll; Rocking',
        items: ['Forward Roll', 'Rocking'],
      },
      {
        column: 'movement',
        source: 'Irimi-Tenkan; Tenkan',
        items: ['Irimi-Tenkan', 'Tenkan'],
      },
      { column: 'attack', source: 'Katatedori Aihami' },
      { column: 'ikkyo', source: 'Katatedori Aihami' },
    ],
  },
  {
    grade: 'Red-Gold (11th Kyu)',
    cells: [
      { column: 'breakfall', source: 'Back Roll' },
      { column: 'ki-exercise', source: 'Kokyu Push' },
      { column: 'movement', source: 'Shikko' },
      { column: 'attack', source: 'Katatedori Gyakuhami' },
      { column: 'iriminage', source: 'Katatedori Aihami' },
      { column: 'kokyunage', source: 'Katatedori Gyakuhami' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Gyakuhami (Tenkan & throw)',
        items: ['Katatedori Gyakuhami|Tenkan & throw'],
      },
    ],
  },
  {
    grade: 'Yellow (10th Kyu)',
    cells: [
      { column: 'ki-exercise', source: 'Rowing Exercise' },
      {
        column: 'movement',
        source: 'Shikko (with movement: Irimi + Tenkan)',
        items: ['Shikko|Irimi', 'Shikko|Tenkan'],
      },
      { column: 'ikkyo', source: 'Suwariwaza Katatedori Aihami' },
      { column: 'iriminage', source: 'Suwariwaza Katatedori Aihami' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Gyakuhami (2 different throws)',
        items: ['Katatedori Gyakuhami|2 different throws'],
      },
      { column: 'kokyuho', source: 'Suwariwaza' },
    ],
  },
  {
    grade: 'Orange (9th Kyu)',
    cells: [
      {
        column: 'attack',
        source: 'Shomenuchi; Yokomenuchi',
        items: ['Shomenuchi', 'Yokomenuchi'],
      },
      { column: 'ikkyo', source: 'Shomenuchi' },
      { column: 'iriminage', source: 'Shomenuchi' },
      { column: 'shihonage', source: 'Katatedori Aihami Omote' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Gyakuhami (4 different throws)',
        items: ['Katatedori Gyakuhami|4 different throws'],
      },
    ],
  },
  {
    grade: 'Green (8th Kyu)',
    cells: [
      { column: 'breakfall', source: 'Forward Roll over obstacles' },
      { column: 'ikkyo', source: 'Suwariwaza Shomenuchi' },
      {
        column: 'nikyo',
        source: 'Katatedori Aihami (Static)',
        items: ['Katatedori Aihami|Static'],
      },
      { column: 'iriminage', source: 'Suwariwaza Shomenuchi' },
      { column: 'shihonage', source: 'Katatedori Aihami Ura' },
      { column: 'kokyunage', source: 'Katatedori Aihami' },
      {
        column: 'kotegaishi',
        source: 'Katatedori Aihami (Static)',
        items: ['Katatedori Aihami|Static'],
      },
      { column: 'jujinage', source: 'Katatedori Aihami' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Aihami (2 different throws)',
        items: ['Katatedori Aihami|2 different throws'],
      },
    ],
  },
  {
    grade: 'Purple (7th Kyu)',
    cells: [
      { column: 'movement', source: 'Katatedori Gyakuhami Tenkan' },
      {
        column: 'ikkyo',
        source: 'Katatedori Gyakuhami (Shikko, finishing lock)',
        items: ['Katatedori Gyakuhami|Shikko, finishing lock'],
      },
      {
        column: 'nikyo',
        source: 'Katatedori Gyakuhami (Static)',
        items: ['Katatedori Gyakuhami|Static'],
      },
      { column: 'iriminage', source: 'Katatedori Gyakuhami' },
      { column: 'shihonage', source: 'Katatedori Gyakuhami Omote' },
      {
        column: 'kotegaishi',
        source: 'Katatedori Gyakuhami (Static)',
        items: ['Katatedori Gyakuhami|Static'],
      },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Gyakuhami (6 different throws)',
        items: ['Katatedori Gyakuhami|6 different throws'],
      },
    ],
  },
  {
    grade: 'Blue (6th Kyu)',
    cells: [
      {
        column: 'movement',
        source: 'Katadori Irimi-Tenkan + Side-step cut',
        items: ['Katadori Irimi-Tenkan', 'Katadori Side-step cut'],
      },
      { column: 'ikkyo', source: 'Katadori (Static)', items: ['Katadori|Static'] },
      { column: 'shihonage', source: 'Katatedori Gyakuhami Ura' },
      { column: 'tenchinage', source: 'Ryotedori Omote' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Gyakuhami (8 different throws)',
        items: ['Katatedori Gyakuhami|8 different throws'],
      },
      {
        column: 'jo-waza',
        source: 'Morotedori (Nage holding Jo, 2 basic throws)',
        items: ['Morotedori|Nage holding Jo · 2 basic throws'],
      },
    ],
  },
]

const childrenPart2Rows: RawRow[] = [
  {
    grade: 'Blue-Silver (6th Kyu)',
    cells: [
      { column: 'movement', source: 'Yokomenuchi Irimi-Tenkan' },
      { column: 'nikyo', source: 'Katadori Omote' },
      { column: 'sankyo', source: 'Katatedori Aihami Omote' },
      { column: 'yonkyo', source: 'Katatedori Aihami Omote' },
      { column: 'shihonage', source: 'Yokomenuchi Omote' },
      { column: 'tenchinage', source: 'Ryotedori Ura' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Aihami (6 different throws)',
        items: ['Katatedori Aihami|6 different throws'],
      },
      {
        column: 'jo-waza',
        source: 'Morotedori (Nage holding Jo, 4 basic throws)',
        items: ['Morotedori|Nage holding Jo · 4 basic throws'],
      },
    ],
  },
  {
    grade: 'Blue-Gold (5th Kyu)',
    cells: [
      { column: 'nikyo', source: 'Katadori Ura' },
      { column: 'sankyo', source: 'Katatedori Aihami Ura' },
      { column: 'yonkyo', source: 'Katatedori Aihami Ura' },
      { column: 'shihonage', source: 'Yokomenuchi Ura' },
      {
        column: 'jiyuwaza',
        source: 'Katatedori Aihami (8 different throws)',
        items: ['Katatedori Aihami|8 different throws'],
      },
      {
        column: 'jo-waza',
        source: 'Defence against Jo Tsuki Attacks (2 basic defences)',
        items: ['Defence against Jo Tsuki Attacks|2 basic defences'],
      },
    ],
  },
  {
    grade: 'Brown (4th Kyu)',
    cells: [
      { column: 'movement', source: 'Ryotedori Irimi-Tenkan' },
      { column: 'nikyo', source: 'Suwariwaza Katadori' },
      { column: 'sankyo', source: 'Suwariwaza Katatedori Aihami' },
      { column: 'yonkyo', source: 'Suwariwaza Katatedori Aihami' },
      { column: 'iriminage', source: 'Tsuki' },
      { column: 'shihonage', source: 'Ryotedori' },
      { column: 'kokyunage', source: 'Ryotedori' },
      {
        column: 'kotegaishi',
        source: 'Katatedori Gyakuhami + Tsuki',
        items: ['Katatedori Gyakuhami', 'Tsuki'],
      },
      {
        column: 'kaitennage',
        source: 'Katatedori Gyakuhami (Uchi + Soto)',
        items: ['Katatedori Gyakuhami|Uchi', 'Katatedori Gyakuhami|Soto'],
      },
      { column: 'jujinage', source: 'Ryotedori' },
      { column: 'jiyuwaza', source: 'Ryotedori' },
      { column: 'ken-waza', source: '1 to 3 of 7 Ken Suburi' },
    ],
  },
  {
    grade: 'Brown-Silver (4th Kyu)',
    cells: [
      { column: 'movement', source: 'Morotedori Tenkan' },
      {
        column: 'nikyo',
        source: 'Tachiwaza + Suwariwaza Shomenuchi',
        items: ['Tachiwaza Shomenuchi', 'Suwariwaza Shomenuchi'],
      },
      {
        column: 'sankyo',
        source: 'Tachiwaza + Suwariwaza Shomenuchi',
        items: ['Tachiwaza Shomenuchi', 'Suwariwaza Shomenuchi'],
      },
      {
        column: 'yonkyo',
        source: 'Tachiwaza + Suwariwaza Shomenuchi',
        items: ['Tachiwaza Shomenuchi', 'Suwariwaza Shomenuchi'],
      },
      { column: 'iriminage', source: 'Morotedori' },
      { column: 'kokyunage', source: 'Morotedori' },
      { column: 'kotegaishi', source: 'Katatedori Aihami Shomenuchi' },
      {
        column: 'kaitennage',
        source: 'Katatedori Aihami (Uchi + Soto)',
        items: ['Katatedori Aihami|Uchi', 'Katatedori Aihami|Soto'],
      },
      { column: 'jiyuwaza', source: 'Morotedori' },
      { column: 'ken-waza', source: '1 to 5 of 7 Ken Suburi' },
    ],
  },
  {
    grade: 'Brown-Gold (3rd Kyu)',
    cells: [
      { column: 'ikkyo', source: 'Yokomenuchi' },
      { column: 'nikyo', source: 'Yokomenuchi' },
      { column: 'sankyo', source: 'Yokomenuchi' },
      { column: 'yonkyo', source: 'Yokomenuchi' },
      { column: 'gokyo', source: 'Yokomenuchi' },
      { column: 'shihonage', source: 'Hanmihandachi Katatedori Gyakuhami' },
      {
        column: 'kokyunage',
        source: 'Yokomenuchi Shomenuchi',
        items: ['Yokomenuchi', 'Shomenuchi'],
      },
      { column: 'kaitennage', source: 'Shomenuchi' },
      {
        column: 'jujinage',
        source: 'Yokomenuchi Shomenuchi',
        items: ['Yokomenuchi', 'Shomenuchi'],
      },
      { column: 'jiyuwaza', source: 'Yokomenuchi' },
      { column: 'ken-waza', source: '7 Ken Suburi' },
    ],
  },
  {
    grade: 'Black (2nd Kyu)',
    cells: [
      { column: 'ikkyo', source: 'Ushiro Ryotedori' },
      { column: 'nikyo', source: 'Ushiro Ryotedori' },
      { column: 'sankyo', source: 'Ushiro Ryotedori' },
      { column: 'yonkyo', source: 'Ushiro Ryotedori' },
      {
        column: 'iriminage',
        source: 'Hanmihandachi Ryotedori + Hanmihandachi Morotedori',
        items: ['Hanmihandachi Ryotedori', 'Hanmihandachi Morotedori'],
      },
      { column: 'shihonage', source: 'Tsuki' },
      { column: 'kokyunage', source: 'Tsuki' },
      { column: 'tenchinage', source: 'Tsuki' },
      { column: 'kaitennage', source: 'Tsuki' },
      {
        column: 'jiyuwaza',
        source: 'Shomenuchi + Tsuki',
        items: ['Shomenuchi', 'Tsuki'],
      },
      { column: 'jo-waza', source: '1 to 3 of 7 Jo Suburi' },
    ],
  },
  {
    grade: 'Black-Silver (2nd Kyu)',
    cells: [
      { column: 'gokyo', source: 'Shomenuchi' },
      { column: 'iriminage', source: 'Yokomenuchi' },
      { column: 'shihonage', source: 'Yokomenuchi' },
      { column: 'kokyunage', source: 'Yokomenuchi' },
      { column: 'tenchinage', source: 'Yokomenuchi' },
      { column: 'kotegaishi', source: 'Yokomenuchi' },
      { column: 'jiyuwaza', source: 'Ushiro attacks' },
      { column: 'jo-waza', source: '1 to 5 of 7 Jo Suburi' },
    ],
  },
]

const adultRows: RawRow[] = [
  {
    grade: 'Blue (6th Kyu)',
    cells: [
      {
        column: 'basics',
        source: 'Breakfalls, Movements, Attacks, Suwariwaza Kokyuho',
        items: ['Breakfalls', 'Movements', 'Attacks', 'Suwariwaza Kokyuho'],
      },
      { column: 'ikkyo', source: 'Katatedori Shomenuchi' },
      { column: 'iriminage', source: 'Katatedori Shomenuchi' },
      { column: 'shihonage', source: 'Katatedori Aihamni' },
      { column: 'kokyunage', source: 'Katatedori Gyakuhanmi' },
      { column: 'jiyuwaza', source: 'Katatedori Gyakuhanmi' },
    ],
  },
  {
    grade: 'Blue-Gold (5th Kyu)',
    cells: [
      {
        column: 'ikkyo',
        source: 'Suwariwaza Katatedori, Suwariwaza Shomenuchi',
        items: ['Suwariwaza Katatedori', 'Suwariwaza Shomenuchi'],
      },
      { column: 'nikyo', source: 'Katadori' },
      {
        column: 'iriminage',
        source: 'Suwariwaza Katatedori, Suwariwaza Shomenuchi',
        items: ['Suwariwaza Katatedori', 'Suwariwaza Shomenuchi'],
      },
      {
        column: 'shihonage',
        source: 'Katatedori Gyakuhanmi, Yokomenuchi',
        items: ['Katatedori Gyakuhanmi', 'Yokomenuchi'],
      },
      { column: 'kokyunage', source: 'Katatedori Aihamni' },
      { column: 'tenchinage', source: 'Ryotedori' },
      { column: 'jujinage', source: 'Katatedori Aihanmi' },
      { column: 'jiyuwaza', source: 'Katatedori Aihanmi' },
    ],
  },
  {
    grade: 'Brown (4th Kyu)',
    cells: [
      {
        column: 'nikyo',
        source: 'Suwariwaza Katadori, Tachiwaza + Suwariwaza Shomenuchi',
        items: [
          'Suwariwaza Katadori',
          'Tachiwaza Shomenuchi',
          'Suwariwaza Shomenuchi',
        ],
      },
      {
        column: 'sankyo',
        source: 'Suwariwaza Katadori, Tachiwaza + Suwariwaza Shomenuchi',
        items: [
          'Suwariwaza Katadori',
          'Tachiwaza Shomenuchi',
          'Suwariwaza Shomenuchi',
        ],
      },
      {
        column: 'yonkyo',
        source: 'Suwariwaza Katadori, Tachiwaza + Suwariwaza Shomenuchi',
        items: [
          'Suwariwaza Katadori',
          'Tachiwaza Shomenuchi',
          'Suwariwaza Shomenuchi',
        ],
      },
      { column: 'iriminage', source: 'Tsuki' },
      { column: 'shihonage', source: 'Ryotedori' },
      { column: 'kokyunage', source: 'Ryotedori' },
      {
        column: 'kotegaishi',
        source: 'Katatedori, Shomenuchi, Tsuki',
        items: ['Katatedori', 'Shomenuchi', 'Tsuki'],
      },
      {
        column: 'kaitennage',
        source: 'Katatedori (Uchi + Soto)',
        items: ['Katatedori|Uchi', 'Katatedori|Soto'],
      },
      { column: 'jujinage', source: 'Ryotedori' },
      { column: 'jiyuwaza', source: 'Ryotedori' },
    ],
  },
  {
    grade: 'Brown-Gold (3rd Kyu)',
    cells: [
      {
        column: 'ikkyo',
        source: 'Tachiwaza + Suwariwaza Katadori',
        items: ['Tachiwaza Katadori', 'Suwariwaza Katadori'],
      },
      {
        column: 'sankyo',
        source: 'Tachiwaza + Suwariwaza Katadori',
        items: ['Tachiwaza Katadori', 'Suwariwaza Katadori'],
      },
      {
        column: 'yonkyo',
        source: 'Tachiwaza + Suwariwaza Katadori',
        items: ['Tachiwaza Katadori', 'Suwariwaza Katadori'],
      },
      { column: 'gokyo', source: 'Yokomenuchi' },
      { column: 'shihonage', source: 'Hanmihandachi Katatedori Gyakuhanmi' },
      {
        column: 'kokyunage',
        source: 'Yokomenuchi, Shomenuchi',
        items: ['Yokomenuchi', 'Shomenuchi'],
      },
      { column: 'kaitennage', source: 'Shomenuchi' },
      {
        column: 'jujinage',
        source: 'Yokomenuchi, Shomenuchi',
        items: ['Yokomenuchi', 'Shomenuchi'],
      },
      { column: 'jiyuwaza', source: 'Morotedori' },
      { column: 'tanto-waza', source: 'Defence against Tanto attacks' },
    ],
  },
  {
    grade: 'Black (2nd Kyu)',
    cells: [
      {
        column: 'ikkyo',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'nikyo',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'sankyo',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'yonkyo',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'shihonage',
        source: 'Hanmihandachi Ryotedori, Hanmihandachi Morotedori',
        items: ['Hanmihandachi Ryotedori', 'Hanmihandachi Morotedori'],
      },
      { column: 'kokyunage', source: 'Tsuki' },
      { column: 'tenchinage', source: 'Tsuki' },
      { column: 'kaitennage', source: 'Tsuki' },
      { column: 'jujigarami', source: 'Morotedori' },
      { column: 'koshinage', source: 'Katatedori' },
      {
        column: 'jiyuwaza',
        source: 'Shomenuchi, Yokomenuchi, Tsuki, Ushiro Attacks',
        items: ['Shomenuchi', 'Yokomenuchi', 'Tsuki', 'Ushiro Attacks'],
      },
      { column: 'jo-waza', source: '7 Jo Suburi' },
      {
        column: 'ken-waza',
        source: '7 Ken Suburi, Defence against Bokken attacks',
        items: ['7 Ken Suburi', 'Defence against Bokken attacks'],
      },
    ],
  },
  {
    grade: 'Black-Gold (1st Kyu)',
    cells: [
      { column: 'gokyo', source: 'Shomenuchi' },
      {
        column: 'iriminage',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'shihonage',
        source: 'Shomenuchi, Ushiro Ryotedori',
        items: ['Shomenuchi', 'Ushiro Ryotedori'],
      },
      { column: 'kokyunage', source: 'Ushiro Ryotedori' },
      {
        column: 'tenchinage',
        source: 'Yokomenuchi, Shomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Shomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'kotegaishi',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      {
        column: 'kaitennage',
        source: 'Yokomenuchi, Ushiro Ryotedori',
        items: ['Yokomenuchi', 'Ushiro Ryotedori'],
      },
      { column: 'jujinage', source: 'Ushiro Ryotedori' },
      { column: 'jujigarami', source: 'Ushiro Ryotedori' },
      {
        column: 'koshinage',
        source: 'Yokomenuchi, Shomenuchi',
        items: ['Yokomenuchi', 'Shomenuchi'],
      },
      {
        column: 'jiyuwaza',
        source: 'Hanmihandachi, 2 Attackers',
        items: ['Hanmihandachi|2 Attackers'],
      },
      {
        column: 'jo-waza',
        source: '31 Jo Kata, Defence against Jo attacks',
        items: ['31 Jo Kata', 'Defence against Jo attacks'],
      },
    ],
  },
  {
    grade: 'Junior Dan',
    cells: [
      {
        column: 'basics',
        span: 15,
        source:
          'Unarmed techniques in Techiwaza, Suwariwaza & Hanmihandachi. Take 20 Ukemis. Achieve a 3 points average on the scoring system.',
        items: [
          'Unarmed techniques in Techiwaza, Suwariwaza & Hanmihandachi',
          'Take 20 Ukemis',
          'Achieve a 3-point average on the scoring system',
        ],
      },
    ],
  },
  {
    grade: '1st Dan',
    cells: [
      {
        column: 'basics',
        span: 15,
        source:
          'Unarmed techniques in Techiwaza, Suwariwaza, Hanmihandachi for all form of strikes, thrusts, grasping of shoulders, elbows, collar, wrists and hands from front & rear. Take 30 Ukemis. Demonstrate unbendable arm. Achieve a 3 points average on the scoring system.',
        items: [
          'Unarmed techniques — all strikes, thrusts and grabs, front & rear',
          'Take 30 Ukemis',
          'Demonstrate unbendable arm',
          'Achieve a 3-point average on the scoring system',
        ],
      },
      { column: 'jiyuwaza', source: '3 Attackers' },
      {
        column: 'jo-waza',
        span: 3,
        source: 'Defence against 3 Attackers with Jo, Bokken & Tanto',
      },
    ],
  },
  {
    grade: '2nd Dan',
    cells: [
      {
        column: 'basics',
        span: 15,
        source:
          'Unarmed techniques similar to above. Defence against kicks. Take 30 Ukemis. Demonstrate relaxation and unable to be lifted by 1 person. Submit an article related subjects. Achieve a 6 points average on the scoring system.',
        items: [
          'Unarmed techniques similar to 1st Dan',
          'Defence against kicks',
          'Take 30 Ukemis',
          'Demonstrate relaxation and unable to be lifted by 1 person',
          'Submit an article on a related subject',
          'Achieve a 6-point average on the scoring system',
        ],
      },
      { column: 'jiyuwaza', source: '4 Attackers' },
      { column: 'jo-waza', source: '24 Jo Kata' },
    ],
  },
  {
    grade: '3rd Dan',
    cells: [
      {
        column: 'basics',
        span: 15,
        source:
          'Unarmed techniques similar to above. Take 30 Ukemis. Demonstrate relaxation and unable to be lifted by 2 persons. Submit an article on Aikido related subjects. Achieve a 9 points average on the scoring system.',
        items: [
          'Unarmed techniques similar to 2nd Dan',
          'Take 30 Ukemis',
          'Demonstrate relaxation and unable to be lifted by 2 persons',
          'Submit an article on an Aikido related subject',
          'Achieve a 9-point average on the scoring system',
        ],
      },
      { column: 'jiyuwaza', source: '5 Attackers' },
      { column: 'jo-waza', source: '24 Jo Kumitachi' },
      { column: 'ken-waza', source: '5 Kumi Ken' },
    ],
  },
  {
    grade: '4th Dan',
    cells: [
      {
        column: 'basics',
        span: 15,
        source:
          'Unarmed, Kaeshi & Henka (Counter & Change) techniques. Take 30 Ukemis. Demonstrate understanding of KI extension, relaxation and show stable seiza. Submit an article on Aikido related subjects. Achieve a 12 points average on the scoring system.',
        items: [
          'Unarmed, Kaeshi & Henka (Counter & Change) techniques',
          'Take 30 Ukemis',
          'Demonstrate KI extension, relaxation and stable seiza',
          'Submit an article on an Aikido related subject',
          'Achieve a 12-point average on the scoring system',
        ],
      },
      { column: 'jiyuwaza', source: '6 Attackers' },
      { column: 'jo-waza', source: '5 Kumi Jo' },
    ],
  },
]

function buildPart(
  id: SyllabusPartId,
  track: GradeTrack,
  title: string,
  subtitle: string,
  columns: SyllabusColumn[],
  notes: string[],
  rows: RawRow[],
): SyllabusPart {
  return {
    id,
    title,
    subtitle,
    track,
    columns,
    notes,
    rows: rows.map((row) => buildRow(id, track, row)),
  }
}

export const syllabusParts: SyllabusPart[] = [
  buildPart(
    'children-1',
    'children',
    "Children's grading — part 1",
    '12th Kyu (Red) to 6th Kyu (Blue)',
    childrenPart1Columns,
    [
      'Children register from age 5 (by year) and start at 12th Kyu (Red).',
      'Counts in brackets, such as “8 different throws”, are minimum demonstration counts rather than separate items.',
      'Syllabus part 1 of 2 · revised October 2014.',
    ],
    childrenPart1Rows,
  ),
  buildPart(
    'children-2',
    'children',
    "Children's grading — part 2",
    '6th Kyu (Blue-Silver) to 2nd Kyu (Black-Silver)',
    childrenPart2Columns,
    [
      'Part 2 continues from part 1. The portal checks only the target grade’s row, not the whole history.',
      'The children’s ladder ends at 2nd Kyu (Black-Silver); students wait until 13 (by year) for adult grading.',
      'Syllabus part 2 of 2 · revised October 2014.',
    ],
    childrenPart2Rows,
  ),
  buildPart(
    'adult',
    'adult',
    'Adult grading',
    'Blue (6th Kyu) to 4th Dan',
    adultColumns,
    [
      'Adults enter at 6th Kyu; 7th Kyu and below may submit directly for 6th Kyu.',
      'Yudansha need a 3-point average per year; points reset when the grader is upgraded.',
      'Candidates aged 50 and above (by year) take 20 ukemis instead of 30 from 2nd Dan.',
      'Revised January 2021.',
    ],
    adultRows,
  ),
]

const byGrade = new Map<string, GradeSyllabus>()
const itemsById = new Map<string, SyllabusItem>()

for (const part of syllabusParts) {
  for (const row of part.rows) {
    byGrade.set(`${row.track}:${row.grade}`, row)
    for (const cell of row.cells) {
      for (const item of cell.items) itemsById.set(item.id, item)
    }
  }
}

export function getGradeSyllabus(
  grade: Grade,
  track: GradeTrack,
): GradeSyllabus | null {
  if (grade === 'Unranked') return null
  return byGrade.get(`${track}:${grade}`) ?? null
}

export function getSyllabusItem(itemId: string): SyllabusItem | null {
  return itemsById.get(itemId) ?? null
}

export function getSyllabusPart(partId: SyllabusPartId): SyllabusPart {
  const part = syllabusParts.find((entry) => entry.id === partId)
  if (!part) throw new Error(`Unknown syllabus part: ${partId}`)
  return part
}

/**
 * Every item the student must have signed off to be invited for `grade` on
 * `track`: just the printed row for that grade. Earlier rows are history and
 * are not re-checked.
 */
export function getGradeSyllabusItems(
  grade: Grade,
  track: GradeTrack,
): SyllabusItem[] {
  return (
    getGradeSyllabus(grade, track)?.cells.flatMap((cell) => cell.items) ?? []
  )
}

export function countSyllabusItems(grade: Grade, track: GradeTrack): number {
  return (
    getGradeSyllabus(grade, track)?.cells.reduce(
      (total, cell) => total + cell.items.length,
      0,
    ) ?? 0
  )
}
