export type RankId = `${number}-kyu` | `${number}-dan`;
export type GradingSystemId = "children" | "adults";
export type StudentRank = { gradingSystem: GradingSystemId; rank: RankId };

export const belts = {
    white: { label: "White belt", indicator: "border-slate-300 bg-white dark:border-slate-500" },
    yellow: { label: "Yellow belt", indicator: "border-yellow-500 bg-yellow-400" },
    orange: { label: "Orange belt", indicator: "border-orange-500 bg-orange-500" },
    green: { label: "Green belt", indicator: "border-green-600 bg-green-600" },
    blue: { label: "Blue belt", indicator: "border-blue-600 bg-blue-600" },
    brown: { label: "Brown belt", indicator: "border-amber-900 bg-amber-800" },
    black: { label: "Black belt", indicator: "border-slate-950 bg-slate-950 dark:border-slate-300" },
} as const;

export type BeltColour = keyof typeof belts;
export type GradeLevel = { rank: RankId; belt: BeltColour };

// Mock progression tables, ordered from beginner to advanced. Configure these for
// the dojo's grading rules; rank and belt are not interchangeable identifiers.
export const gradingSystems: Record<GradingSystemId, { label: string; levels: readonly GradeLevel[] }> = {
    children: {
        label: "Children's grading",
        levels: [
            { rank: "10-kyu", belt: "white" },
            { rank: "9-kyu", belt: "white" },
            { rank: "8-kyu", belt: "yellow" },
            { rank: "7-kyu", belt: "orange" },
            { rank: "6-kyu", belt: "green" },
            { rank: "5-kyu", belt: "green" },
            { rank: "4-kyu", belt: "blue" },
            { rank: "3-kyu", belt: "blue" },
            { rank: "2-kyu", belt: "brown" },
            { rank: "1-kyu", belt: "brown" },
        ],
    },
    adults: {
        label: "Adults' grading",
        levels: [
            { rank: "6-kyu", belt: "white" },
            { rank: "5-kyu", belt: "yellow" },
            { rank: "4-kyu", belt: "orange" },
            { rank: "3-kyu", belt: "green" },
            { rank: "2-kyu", belt: "blue" },
            { rank: "1-kyu", belt: "brown" },
            { rank: "1-dan", belt: "black" },
            { rank: "2-dan", belt: "black" },
            { rank: "3-dan", belt: "black" },
            { rank: "4-dan", belt: "black" },
            { rank: "5-dan", belt: "black" },
        ],
    },
};

export function formatRank(rank: RankId) {
    const match = /^([1-9]\d*)-(kyu|dan)$/.exec(rank);
    if (!match) return "Rank not recorded";
    const number = Number(match[1]);
    const lastTwo = number % 100;
    const suffix = lastTwo >= 11 && lastTwo <= 13
        ? "th"
        : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[number % 10] ?? "th";
    return `${number}${suffix} ${match[2] === "kyu" ? "Kyu" : "Dan"}`;
}

export function getGrade(system: GradingSystemId, rank: RankId | null | undefined) {
    return gradingSystems[system]?.levels.find((level) => level.rank === rank) ?? null;
}

export function getNextGrade(system: GradingSystemId, rank: RankId) {
    const levels = gradingSystems[system]?.levels ?? [];
    const index = levels.findIndex((level) => level.rank === rank);
    return index >= 0 ? levels[index + 1] ?? null : null;
}

export function compareRanks(left: RankId, right: RankId) {
    const [leftNumber, leftType] = left.split("-");
    const [rightNumber, rightType] = right.split("-");
    if (leftType !== rightType) return leftType === "kyu" ? -1 : 1;
    return leftType === "kyu" ? Number(rightNumber) - Number(leftNumber) : Number(leftNumber) - Number(rightNumber);
}
