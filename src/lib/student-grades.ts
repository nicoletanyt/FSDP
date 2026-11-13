export type SilverRankId = `${2 | 4 | 6}-kyu-silver`;
export type RankId = `${number}-kyu` | `${number}-dan` | SilverRankId | "junior-dan";
export type GradingSystemId = "children" | "adults";
export type StudentRank = { gradingSystem: GradingSystemId; rank: RankId };

export const belts = {
    red: { label: "Red belt", indicator: "border-red-600 bg-red-600" },
    "red-gold": { label: "Red-Gold belt", indicator: "border-red-600 bg-[linear-gradient(to_right,#dc2626_65%,#d4af37_65%)]" },
    yellow: { label: "Yellow belt", indicator: "border-yellow-500 bg-yellow-400" },
    orange: { label: "Orange belt", indicator: "border-orange-500 bg-orange-500" },
    green: { label: "Green belt", indicator: "border-green-600 bg-green-600" },
    purple: { label: "Purple belt", indicator: "border-purple-600 bg-purple-600" },
    blue: { label: "Blue belt", indicator: "border-blue-600 bg-blue-600" },
    "blue-silver": { label: "Blue-Silver belt", indicator: "border-blue-600 bg-[linear-gradient(to_right,#2563eb_65%,#cbd5e1_65%)]" },
    "blue-gold": { label: "Blue-Gold belt", indicator: "border-blue-600 bg-[linear-gradient(to_right,#2563eb_65%,#d4af37_65%)]" },
    brown: { label: "Brown belt", indicator: "border-amber-900 bg-amber-800" },
    "brown-silver": { label: "Brown-Silver belt", indicator: "border-amber-900 bg-[linear-gradient(to_right,#92400e_65%,#cbd5e1_65%)]" },
    "brown-gold": { label: "Brown-Gold belt", indicator: "border-amber-900 bg-[linear-gradient(to_right,#92400e_65%,#d4af37_65%)]" },
    black: { label: "Black belt", indicator: "border-slate-950 bg-slate-950 dark:border-slate-300" },
    "black-silver": { label: "Black-Silver belt", indicator: "border-slate-950 bg-[linear-gradient(to_right,#020617_65%,#cbd5e1_65%)] dark:border-slate-300" },
    "black-gold": { label: "Black-Gold belt", indicator: "border-slate-950 bg-[linear-gradient(to_right,#020617_65%,#d4af37_65%)] dark:border-slate-300" },
} as const;

export type BeltColour = keyof typeof belts;
export type GradeLevel = { rank: RankId; belt: BeltColour };

// Published ASK syllabus: children's sheets revised October 2014; adult sheet
// revised January 2021. Source PDFs and transcription are in commit ee2bc1b:
// https://github.com/nicoletanyt/FSDP/tree/ee2bc1b5b6436a48332ce0f7cb97bcbf23ba5661/grading_info
// Silver awards share a kyu number with the plain belt but are distinct grades.
export const gradingSystems: Record<GradingSystemId, { label: string; levels: readonly GradeLevel[] }> = {
    children: {
        label: "Children's grading",
        levels: [
            { rank: "12-kyu", belt: "red" },
            { rank: "11-kyu", belt: "red-gold" },
            { rank: "10-kyu", belt: "yellow" },
            { rank: "9-kyu", belt: "orange" },
            { rank: "8-kyu", belt: "green" },
            { rank: "7-kyu", belt: "purple" },
            { rank: "6-kyu", belt: "blue" },
            { rank: "6-kyu-silver", belt: "blue-silver" },
            { rank: "5-kyu", belt: "blue-gold" },
            { rank: "4-kyu", belt: "brown" },
            { rank: "4-kyu-silver", belt: "brown-silver" },
            { rank: "3-kyu", belt: "brown-gold" },
            { rank: "2-kyu", belt: "black" },
            { rank: "2-kyu-silver", belt: "black-silver" },
        ],
    },
    adults: {
        label: "Adults' grading",
        levels: [
            { rank: "6-kyu", belt: "blue" },
            { rank: "5-kyu", belt: "blue-gold" },
            { rank: "4-kyu", belt: "brown" },
            { rank: "3-kyu", belt: "brown-gold" },
            { rank: "2-kyu", belt: "black" },
            { rank: "1-kyu", belt: "black-gold" },
            { rank: "1-dan", belt: "black" },
            { rank: "2-dan", belt: "black" },
            { rank: "3-dan", belt: "black" },
            { rank: "4-dan", belt: "black" },
        ],
    },
};

// Adults may hold silver intermediate awards, but apply for the next full kyu.
// Junior Dan is an age-dependent branch from 1st Kyu, not a compulsory step.
const adultAwards: readonly GradeLevel[] = [
    { rank: "6-kyu-silver", belt: "blue-silver" },
    { rank: "4-kyu-silver", belt: "brown-silver" },
    { rank: "2-kyu-silver", belt: "black-silver" },
    { rank: "junior-dan", belt: "black" },
];

export function formatRank(rank: RankId) {
    if (rank === "junior-dan") return "Junior Dan";
    const match = /^([1-9]\d*)-(kyu|dan)(-silver)?$/.exec(rank);
    if (!match) return "Rank not recorded";
    const number = Number(match[1]);
    const lastTwo = number % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13
        ? "th"
        : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[number % 10] ?? "th";
    return `${number}${suffix} ${match[2] === "kyu" ? "Kyu" : "Dan"}${match[3] ? " (Silver)" : ""}`;
}

export function getGrade(system: GradingSystemId, rank: RankId | null | undefined) {
    const grade = gradingSystems[system]?.levels.find((level) => level.rank === rank);
    if (grade) return grade;
    // A student entering the adult track keeps their existing children's belt.
    return system === "adults" ? adultAwards.find((level) => level.rank === rank)
        ?? gradingSystems.children.levels.find((level) => level.rank === rank) ?? null : null;
}

export function getNextGrade(system: GradingSystemId, rank: RankId, calendarYearAge?: number) {
    const levels = gradingSystems[system]?.levels ?? [];
    if (system === "adults") {
        if (rank === "junior-dan") return getGrade(system, "1-dan");
        if (rank === "1-kyu" && calendarYearAge !== undefined && calendarYearAge <= 14) {
            return getGrade(system, "junior-dan");
        }
        const adultEntry: Partial<Record<RankId, RankId>> = {
            "12-kyu": "6-kyu", "11-kyu": "6-kyu", "10-kyu": "6-kyu",
            "9-kyu": "6-kyu", "8-kyu": "6-kyu", "7-kyu": "6-kyu",
            "6-kyu-silver": "5-kyu", "4-kyu-silver": "3-kyu", "2-kyu-silver": "1-kyu",
        };
        const target = adultEntry[rank];
        if (target) return getGrade(system, target);
    }
    const index = levels.findIndex((level) => level.rank === rank);
    return index >= 0 ? levels[index + 1] ?? null : null;
}

export function compareRanks(left: RankId, right: RankId) {
    if (left === right) return 0;
    if (left === "junior-dan") return right.endsWith("-dan") ? -1 : 1;
    if (right === "junior-dan") return left.endsWith("-dan") ? 1 : -1;
    const [leftNumber, leftType] = left.split("-");
    const [rightNumber, rightType] = right.split("-");
    if (leftType !== rightType) return leftType === "kyu" ? -1 : 1;
    const order = leftType === "kyu" ? Number(rightNumber) - Number(leftNumber) : Number(leftNumber) - Number(rightNumber);
    return order || Number(left.endsWith("-silver")) - Number(right.endsWith("-silver"));
}

// Technique rows from the same published syllabus as the shared belt mapping.
// Stable item IDs preserve existing browser sign-offs when the UI is reordered.
export type TechniqueItem = { id: string; label: string; note?: string };
export type TechniqueCategory = { id: string; label: string; items: TechniqueItem[] };
export type GradingSyllabus = {
    grade: string;
    minMonths: number;
    maxMonths?: number;
    sessions?: number;
    minAge?: number;
    maxAge?: number;
    categories: TechniqueCategory[];
};

type RawCategory = [category: string, ...items: string[]];
type RawSyllabus = Omit<GradingSyllabus, "categories"> & { categories: RawCategory[] };

const childrenSyllabus: Partial<Record<RankId, RawSyllabus>> = {
    "12-kyu": {
        grade: "Red (12th Kyu)", minMonths: 3, minAge: 5,
        categories: [
            ["Breakfall", "Forward Roll", "Rocking"], ["Movement", "Irimi-Tenkan", "Tenkan"],
            ["Attack", "Katatedori Aihami"], ["Ikkyo", "Katatedori Aihami"],
        ],
    },
    "11-kyu": {
        grade: "Red-Gold (11th Kyu)", minMonths: 4,
        categories: [
            ["Breakfall", "Back Roll"], ["Ki-Exercise", "Kokyu Push"], ["Movement", "Shikko"],
            ["Attack", "Katatedori Gyakuhami"], ["Iriminage", "Katatedori Aihami"],
            ["Kokyunage", "Katatedori Gyakuhami"], ["Jiyuwaza", "Katatedori Gyakuhami|Tenkan & throw"],
        ],
    },
    "10-kyu": {
        grade: "Yellow (10th Kyu)", minMonths: 4,
        categories: [
            ["Ki-Exercise", "Rowing Exercise"], ["Movement", "Shikko|Irimi", "Shikko|Tenkan"],
            ["Ikkyo", "Suwariwaza Katatedori Aihami"], ["Iriminage", "Suwariwaza Katatedori Aihami"],
            ["Jiyuwaza", "Katatedori Gyakuhami|2 different throws"], ["Kokyuho", "Suwariwaza"],
        ],
    },
    "9-kyu": {
        grade: "Orange (9th Kyu)", minMonths: 4,
        categories: [
            ["Attack", "Shomenuchi", "Yokomenuchi"], ["Ikkyo", "Shomenuchi"], ["Iriminage", "Shomenuchi"],
            ["Shihonage", "Katatedori Aihami Omote"], ["Jiyuwaza", "Katatedori Gyakuhami|4 different throws"],
        ],
    },
    "8-kyu": {
        grade: "Green (8th Kyu)", minMonths: 4, maxMonths: 6,
        categories: [
            ["Breakfall", "Forward Roll over obstacles"], ["Ikkyo", "Suwariwaza Shomenuchi"],
            ["Nikyo", "Katatedori Aihami|Static"], ["Iriminage", "Suwariwaza Shomenuchi"],
            ["Shihonage", "Katatedori Aihami Ura"], ["Kokyunage", "Katatedori Aihami"],
            ["Kotegaishi", "Katatedori Aihami|Static"], ["Jujinage", "Katatedori Aihami"],
            ["Jiyuwaza", "Katatedori Aihami|2 different throws"],
        ],
    },
    "7-kyu": {
        grade: "Purple (7th Kyu)", minMonths: 6,
        categories: [
            ["Movement", "Katatedori Gyakuhami Tenkan"], ["Ikkyo", "Katatedori Gyakuhami|Shikko, finishing lock"],
            ["Nikyo", "Katatedori Gyakuhami|Static"], ["Iriminage", "Katatedori Gyakuhami"],
            ["Shihonage", "Katatedori Gyakuhami Omote"], ["Kotegaishi", "Katatedori Gyakuhami|Static"],
            ["Jiyuwaza", "Katatedori Gyakuhami|6 different throws"],
        ],
    },
    "6-kyu": {
        grade: "Blue (6th Kyu)", minMonths: 6,
        categories: [
            ["Movement", "Katadori Irimi-Tenkan", "Katadori Side-step cut"], ["Ikkyo", "Katadori|Static"],
            ["Shihonage", "Katatedori Gyakuhami Ura"], ["Tenchinage", "Ryotedori Omote"],
            ["Jiyuwaza", "Katatedori Gyakuhami|8 different throws"], ["Jo Waza", "Morotedori|Nage holding Jo · 2 basic throws"],
        ],
    },
    "6-kyu-silver": {
        grade: "Blue-Silver (6th Kyu)", minMonths: 6,
        categories: [
            ["Movement", "Yokomenuchi Irimi-Tenkan"], ["Nikyo", "Katadori Omote"],
            ["Sankyo", "Katatedori Aihami Omote"], ["Yonkyo", "Katatedori Aihami Omote"],
            ["Shihonage", "Yokomenuchi Omote"], ["Tenchinage", "Ryotedori Ura"],
            ["Jiyuwaza", "Katatedori Aihami|6 different throws"], ["Jo Waza", "Morotedori|Nage holding Jo · 4 basic throws"],
        ],
    },
    "5-kyu": {
        grade: "Blue-Gold (5th Kyu)", minMonths: 6,
        categories: [
            ["Nikyo", "Katadori Ura"], ["Sankyo", "Katatedori Aihami Ura"], ["Yonkyo", "Katatedori Aihami Ura"],
            ["Shihonage", "Yokomenuchi Ura"], ["Jiyuwaza", "Katatedori Aihami|8 different throws"],
            ["Jo Waza", "Defence against Jo Tsuki Attacks|2 basic defences"],
        ],
    },
    "4-kyu": {
        grade: "Brown (4th Kyu)", minMonths: 10,
        categories: [
            ["Movement", "Ryotedori Irimi-Tenkan"], ["Nikyo", "Suwariwaza Katadori"],
            ["Sankyo", "Suwariwaza Katatedori Aihami"], ["Yonkyo", "Suwariwaza Katatedori Aihami"],
            ["Iriminage", "Tsuki"], ["Shihonage", "Ryotedori"], ["Kokyunage", "Ryotedori"],
            ["Kotegaishi", "Katatedori Gyakuhami", "Tsuki"], ["Kaitennage", "Katatedori Gyakuhami|Uchi", "Katatedori Gyakuhami|Soto"],
            ["Jujinage", "Ryotedori"], ["Jiyuwaza", "Ryotedori"], ["Ken Waza", "1 to 3 of 7 Ken Suburi"],
        ],
    },
    "4-kyu-silver": {
        grade: "Brown-Silver (4th Kyu)", minMonths: 10,
        categories: [
            ["Movement", "Morotedori Tenkan"], ["Nikyo", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"],
            ["Sankyo", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"], ["Yonkyo", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"],
            ["Iriminage", "Morotedori"], ["Kokyunage", "Morotedori"], ["Kotegaishi", "Katatedori Aihami Shomenuchi"],
            ["Kaitennage", "Katatedori Aihami|Uchi", "Katatedori Aihami|Soto"], ["Jiyuwaza", "Morotedori"], ["Ken Waza", "1 to 5 of 7 Ken Suburi"],
        ],
    },
    "3-kyu": {
        grade: "Brown-Gold (3rd Kyu)", minMonths: 8, maxMonths: 10,
        categories: [
            ["Ikkyo", "Yokomenuchi"], ["Nikyo", "Yokomenuchi"], ["Sankyo", "Yokomenuchi"], ["Yonkyo", "Yokomenuchi"],
            ["Gokyo", "Yokomenuchi"], ["Shihonage", "Hanmihandachi Katatedori Gyakuhami"],
            ["Kokyunage", "Yokomenuchi", "Shomenuchi"], ["Kaitennage", "Shomenuchi"],
            ["Jujinage", "Yokomenuchi", "Shomenuchi"], ["Jiyuwaza", "Yokomenuchi"], ["Ken Waza", "7 Ken Suburi"],
        ],
    },
    "2-kyu": {
        grade: "Black (2nd Kyu)", minMonths: 10, minAge: 12,
        categories: [
            ["Ikkyo", "Ushiro Ryotedori"], ["Nikyo", "Ushiro Ryotedori"], ["Sankyo", "Ushiro Ryotedori"], ["Yonkyo", "Ushiro Ryotedori"],
            ["Iriminage", "Hanmihandachi Ryotedori", "Hanmihandachi Morotedori"], ["Shihonage", "Tsuki"],
            ["Kokyunage", "Tsuki"], ["Tenchinage", "Tsuki"], ["Kaitennage", "Tsuki"],
            ["Jiyuwaza", "Shomenuchi", "Tsuki"], ["Jo Waza", "1 to 3 of 7 Jo Suburi"],
        ],
    },
    "2-kyu-silver": {
        grade: "Black-Silver (2nd Kyu)", minMonths: 10,
        categories: [
            ["Gokyo", "Shomenuchi"], ["Iriminage", "Yokomenuchi"], ["Shihonage", "Yokomenuchi"], ["Kokyunage", "Yokomenuchi"],
            ["Tenchinage", "Yokomenuchi"], ["Kotegaishi", "Yokomenuchi"], ["Jiyuwaza", "Ushiro attacks"], ["Jo Waza", "1 to 5 of 7 Jo Suburi"],
        ],
    },
};

const adultSyllabus: Partial<Record<RankId, RawSyllabus>> = {
    "6-kyu": {
        grade: "Blue (6th Kyu)", minMonths: 3, sessions: 20,
        categories: [
            ["Basics", "Breakfalls", "Movements", "Attacks", "Suwariwaza Kokyuho"], ["Ikkyo", "Katatedori Shomenuchi"],
            ["Iriminage", "Katatedori Shomenuchi"], ["Shihonage", "Katatedori Aihamni"],
            ["Kokyunage", "Katatedori Gyakuhanmi"], ["Jiyuwaza", "Katatedori Gyakuhanmi"],
        ],
    },
    "5-kyu": {
        grade: "Blue-Gold (5th Kyu)", minMonths: 0, sessions: 24,
        categories: [
            ["Ikkyo", "Suwariwaza Katatedori", "Suwariwaza Shomenuchi"], ["Nikyo", "Katadori"],
            ["Iriminage", "Suwariwaza Katatedori", "Suwariwaza Shomenuchi"], ["Shihonage", "Katatedori Gyakuhanmi", "Yokomenuchi"],
            ["Kokyunage", "Katatedori Aihamni"], ["Tenchinage", "Ryotedori"], ["Jujinage", "Katatedori Aihanmi"], ["Jiyuwaza", "Katatedori Aihanmi"],
        ],
    },
    "4-kyu": {
        grade: "Brown (4th Kyu)", minMonths: 0, sessions: 32,
        categories: [
            ["Nikyo", "Suwariwaza Katadori", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"],
            ["Sankyo", "Suwariwaza Katadori", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"],
            ["Yonkyo", "Suwariwaza Katadori", "Tachiwaza Shomenuchi", "Suwariwaza Shomenuchi"],
            ["Iriminage", "Tsuki"], ["Shihonage", "Ryotedori"], ["Kokyunage", "Ryotedori"],
            ["Kotegaishi", "Katatedori", "Shomenuchi", "Tsuki"], ["Kaitennage", "Katatedori|Uchi", "Katatedori|Soto"],
            ["Jujinage", "Ryotedori"], ["Jiyuwaza", "Ryotedori"],
        ],
    },
    "3-kyu": {
        grade: "Brown-Gold (3rd Kyu)", minMonths: 6, sessions: 36,
        categories: [
            ["Ikkyo", "Tachiwaza Katadori", "Suwariwaza Katadori"], ["Sankyo", "Tachiwaza Katadori", "Suwariwaza Katadori"],
            ["Yonkyo", "Tachiwaza Katadori", "Suwariwaza Katadori"], ["Gokyo", "Yokomenuchi"],
            ["Shihonage", "Hanmihandachi Katatedori Gyakuhanmi"], ["Kokyunage", "Yokomenuchi", "Shomenuchi"],
            ["Kaitennage", "Shomenuchi"], ["Jujinage", "Yokomenuchi", "Shomenuchi"],
            ["Jiyuwaza", "Morotedori"], ["Tanto Waza", "Defence against Tanto attacks"],
        ],
    },
    "2-kyu": {
        grade: "Black (2nd Kyu)", minMonths: 6, sessions: 56,
        categories: [
            ["Ikkyo", "Yokomenuchi", "Ushiro Ryotedori"], ["Nikyo", "Yokomenuchi", "Ushiro Ryotedori"],
            ["Sankyo", "Yokomenuchi", "Ushiro Ryotedori"], ["Yonkyo", "Yokomenuchi", "Ushiro Ryotedori"],
            ["Shihonage", "Hanmihandachi Ryotedori", "Hanmihandachi Morotedori"], ["Kokyunage", "Tsuki"],
            ["Tenchinage", "Tsuki"], ["Kaitennage", "Tsuki"], ["Jujigarami", "Morotedori"], ["Koshinage", "Katatedori"],
            ["Jiyuwaza", "Shomenuchi", "Yokomenuchi", "Tsuki", "Ushiro Attacks"], ["Jo Waza", "7 Jo Suburi"],
            ["Ken Waza", "7 Ken Suburi", "Defence against Bokken attacks"],
        ],
    },
    "1-kyu": {
        grade: "Black-Gold (1st Kyu)", minMonths: 9, sessions: 62,
        categories: [
            ["Gokyo", "Shomenuchi"], ["Iriminage", "Yokomenuchi", "Ushiro Ryotedori"],
            ["Shihonage", "Shomenuchi", "Ushiro Ryotedori"], ["Kokyunage", "Ushiro Ryotedori"],
            ["Tenchinage", "Yokomenuchi", "Shomenuchi", "Ushiro Ryotedori"], ["Kotegaishi", "Yokomenuchi", "Ushiro Ryotedori"],
            ["Kaitennage", "Yokomenuchi", "Ushiro Ryotedori"], ["Jujinage", "Ushiro Ryotedori"], ["Jujigarami", "Ushiro Ryotedori"],
            ["Koshinage", "Yokomenuchi", "Shomenuchi"], ["Jiyuwaza", "Hanmihandachi|2 Attackers"], ["Jo Waza", "31 Jo Kata", "Defence against Jo attacks"],
        ],
    },
    "junior-dan": {
        grade: "Junior Dan", minMonths: 9, sessions: 62, maxAge: 14,
        categories: [["Basics", "Unarmed techniques in Techiwaza, Suwariwaza & Hanmihandachi", "Take 20 Ukemis", "Achieve a 3-point average on the scoring system"]],
    },
    "1-dan": {
        grade: "1st Dan", minMonths: 9, sessions: 70, minAge: 15,
        categories: [
            ["Basics", "Unarmed techniques — all strikes, thrusts and grabs, front & rear", "Take 30 Ukemis", "Demonstrate unbendable arm", "Achieve a 3-point average on the scoring system"],
            ["Jiyuwaza", "3 Attackers"], ["Jo Waza", "Defence against 3 Attackers with Jo, Bokken & Tanto"],
        ],
    },
    "2-dan": {
        grade: "2nd Dan", minMonths: 18, sessions: 150,
        categories: [
            ["Basics", "Unarmed techniques similar to 1st Dan", "Defence against kicks", "Take 30 Ukemis", "Demonstrate relaxation and unable to be lifted by 1 person", "Submit an article on a related subject", "Achieve a 6-point average on the scoring system"],
            ["Jiyuwaza", "4 Attackers"], ["Jo Waza", "24 Jo Kata"],
        ],
    },
    "3-dan": {
        grade: "3rd Dan", minMonths: 30, sessions: 240,
        categories: [
            ["Basics", "Unarmed techniques similar to 2nd Dan", "Take 30 Ukemis", "Demonstrate relaxation and unable to be lifted by 2 persons", "Submit an article on an Aikido related subject", "Achieve a 9-point average on the scoring system"],
            ["Jiyuwaza", "5 Attackers"], ["Jo Waza", "24 Jo Kumitachi"], ["Ken Waza", "5 Kumi Ken"],
        ],
    },
    "4-dan": {
        grade: "4th Dan", minMonths: 42, sessions: 400, minAge: 26,
        categories: [
            ["Basics", "Unarmed, Kaeshi & Henka (Counter & Change) techniques", "Take 30 Ukemis", "Demonstrate KI extension, relaxation and stable seiza", "Submit an article on an Aikido related subject", "Achieve a 12-point average on the scoring system"],
            ["Jiyuwaza", "6 Attackers"], ["Jo Waza", "5 Kumi Jo"],
        ],
    },
};

function syllabusSlug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getGradingSyllabus(system: GradingSystemId, rank: RankId | null): GradingSyllabus | null {
    const row = rank ? (system === "children" ? childrenSyllabus : adultSyllabus)[rank] : undefined;
    if (!row) return null;
    const track = system === "children" ? "children" : "adult";
    return {
        ...row,
        categories: row.categories.map(([label, ...items]) => ({
            id: syllabusSlug(label),
            label,
            items: items.map((entry) => {
                const [itemLabel, note] = entry.split("|");
                return {
                    id: `${track}/${syllabusSlug(row.grade)}/${syllabusSlug(label)}/${syllabusSlug(`${itemLabel} ${note ?? ""}`)}`,
                    label: itemLabel,
                    note,
                };
            }),
        })),
    };
}
