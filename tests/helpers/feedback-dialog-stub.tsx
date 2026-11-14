import React from 'react'

// Stands in for the real alert dialog, which needs a browser DOM the test renderer lacks.
export function FeedbackDialog({ open, title, description }: { open: boolean; title: string; description?: string }) {
  return open ? React.createElement('div', { role: 'alertdialog' }, title, description) : null
}
