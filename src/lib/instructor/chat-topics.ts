// Suggestions are prompts, not canned answers. They use the same authenticated
// OpenRouter request and read-only database tools as a typed question.
export const instructorChatTopics = {
  today: {
    label: 'What classes am I teaching today?',
    prompt: 'What classes and events am I assigned to today?',
    followUps: ['week', 'absences', 'followUp'],
  },
  week: {
    label: 'What’s on my schedule this week?',
    prompt: 'What is my assigned teaching schedule for this week?',
    followUps: ['today', 'grading', 'followUp'],
  },
  absences: {
    label: 'Who was absent from my last class?',
    prompt: 'Find my most recent class that has already ended (check my schedule for the past 7 days), then list who was absent and who is still unmarked.',
    followUps: ['followUp', 'attendance', 'today'],
  },
  followUp: {
    label: 'Which students need a follow-up?',
    prompt: 'Which students I have taught recently have missed 3 or more classes in a row?',
    followUps: ['attendance', 'history', 'absences'],
  },
  grading: {
    label: 'What gradings am I examining?',
    prompt: 'What gradings am I on the examiner panel for? For the next upcoming one, list its candidates.',
    followUps: ['readiness', 'week', 'today'],
  },
  readiness: {
    label: 'Is this student ready for grading?',
    prompt: 'Check whether the student we are discussing meets every requirement for their next grade and whether they have been endorsed. If no single student is identified, ask me for a name or membership number first.',
    followUps: ['attendance', 'history', 'grading'],
  },
  attendance: {
    label: 'How is this student’s attendance?',
    prompt: 'Check attendance for the student we are discussing. If no single student is identified, ask me for a name or membership number first.',
    followUps: ['history', 'readiness', 'followUp'],
  },
  history: {
    label: 'What sessions has this student attended?',
    prompt: 'Show past sessions for the student we are discussing. If no single student is identified, ask me for a name or membership number first.',
    followUps: ['attendance', 'readiness', 'today'],
  },
} as const

export type InstructorChatTopic = keyof typeof instructorChatTopics

export const starterChatTopics: readonly InstructorChatTopic[] = ['today', 'absences', 'followUp', 'grading']

export function followUpChatTopics(topic?: InstructorChatTopic): readonly InstructorChatTopic[] {
  return topic ? instructorChatTopics[topic].followUps : ['today', 'week', 'attendance']
}
