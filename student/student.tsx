export type Student = {
  firstName: string;
  membershipStatus: "Active" | "Expired" | "Pending";
  belt: { name: string; colour: string; hex: string };
  nextBelt: { name: string; colour: string };
  requirements: {
    sessions: { done: number; required: number };
    monthsInRank: { done: number; required: number };
    feePaid: boolean;
  };
  gradingOpen: boolean;
  nextClass: {
    title: string;
    startsAt: string; // ISO string
    centre: string;
    instructor: string;
    recommended: boolean;
  } | null;
  counts: { classesEnrolled: number; pendingGrading: number; attendanceRate: number };
};

// TODO: replace with Supabase queries (users, attendance, grading requirements).
export const mockStudent: Student = {
  firstName: "Jess",
  membershipStatus: "Active",
  belt: { name: "5th Kyu", colour: "Yellow", hex: "#e8b923" },
  nextBelt: { name: "4th Kyu", colour: "Orange" },
  requirements: {
    sessions: { done: 18, required: 24 },
    monthsInRank: { done: 6, required: 6 },
    feePaid: true,
  },
  gradingOpen: false,
  nextClass: {
    title: "Adult Beginners Aikido",
    startsAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    centre: "Bishan Dojo",
    instructor: "Sensei Tan",
    recommended: true,
  },
  counts: { classesEnrolled: 3, pendingGrading: 0, attendanceRate: 86 },
};