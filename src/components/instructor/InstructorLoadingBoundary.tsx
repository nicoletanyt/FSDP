import type { ReactNode } from 'react'

// Loading is presented inline by each data region, not as a blocking dialog.
export default function InstructorLoadingBoundary({ children }: { children: ReactNode; title?: string }) {
  return <>{children}</>
}
