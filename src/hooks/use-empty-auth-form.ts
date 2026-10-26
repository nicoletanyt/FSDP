import { useEffect, useRef } from 'react'

export function useEmptyAuthForm() {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const clearForm = () => formRef.current?.reset()
    clearForm()
    // Also clear values restored from the browser's back/forward cache.
    window.addEventListener('pageshow', clearForm)
    return () => window.removeEventListener('pageshow', clearForm)
  }, [])

  return formRef
}
