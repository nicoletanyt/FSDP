// Suggestions are prompts, not canned answers. They use the same authenticated
// Ollama request and read-only database tools as a typed question.
export const instructorChatTopics = {
  today: {
    label: 'What classes am I teaching today?',
    prompt: 'What classes and events am I assigned to today?',
    followUps: ['week', 'attendance', 'history'],
  },
  week: {
    label: 'What’s on my schedule this week?',
    prompt: 'What is my assigned teaching schedule for this week?',
    followUps: ['today', 'attendance', 'history'],
  },
  attendance: {
    label: 'How is this student’s attendance?',
    prompt: 'Check attendance for the student we are discussing. If no single student is identified, ask me for a name or membership number first.',
    followUps: ['history', 'today', 'week'],
  },
  history: {
    label: 'What sessions has this student attended?',
    prompt: 'Show past sessions for the student we are discussing. If no single student is identified, ask me for a name or membership number first.',
    followUps: ['attendance', 'today', 'week'],
  },
} as const

export type InstructorChatTopic = keyof typeof instructorChatTopics

export const starterChatTopics: readonly InstructorChatTopic[] = ['today', 'week', 'attendance', 'history']

export function followUpChatTopics(topic?: InstructorChatTopic): readonly InstructorChatTopic[] {
  return topic ? instructorChatTopics[topic].followUps : ['today', 'week', 'attendance']
}
