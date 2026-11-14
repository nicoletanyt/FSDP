import { useQuery } from '@tanstack/react-query'

// Photo links for a set of examiners, cached across pages. Signed links last an
// hour, so they are refreshed well before then. Failures just show initials.
export function useExaminerPhotos(ids: string[], load: ((ids: string[]) => Promise<Record<string, string>>) | undefined) {
  const sorted = [...new Set(ids)].sort()
  const query = useQuery({
    queryKey: ['examiner-photos', ...sorted],
    queryFn: () => load!(sorted),
    enabled: Boolean(load && sorted.length),
    staleTime: 30 * 60_000,
    gcTime: 45 * 60_000,
    retry: false,
  })
  return query.data ?? {}
}
