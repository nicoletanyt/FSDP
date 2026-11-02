export type GradingSession = {
  id: string;
  startsAt: string; // ISO datetime
  centre: string;
};

export type GradingWindow = {
  /** Set by the admin side once the student is notified as eligible. */
  open: boolean;
  sessions: GradingSession[];
};

// TODO: replace with a Supabase query (grading_windows / grading_sessions for this student).
// Flip `open` to false to preview the "no applications open" state.
export const mockGradingWindow: GradingWindow = {
  open: true,
  sessions: [
    { id: "gs_1", startsAt: "2026-11-21T10:00:00+08:00", centre: "Bishan Dojo" },
    { id: "gs_2", startsAt: "2026-11-21T14:00:00+08:00", centre: "Bishan Dojo" },
    { id: "gs_3", startsAt: "2026-11-28T10:00:00+08:00", centre: "Tampines Dojo" },
  ],
};
