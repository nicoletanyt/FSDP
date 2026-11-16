// Every key is scoped by the authenticated user ID, mirroring instructorQueryKeys.
export const studentQueryKeys = {
  all: (userId: string) => ['student', userId] as const,
  schedule: (userId: string) => [...studentQueryKeys.all(userId), 'schedule'] as const,
  // Invalidating the prefix refreshes every mounted copy (layout and navbar).
  creditsAll: (userId: string) => [...studentQueryKeys.all(userId), 'credits'] as const,
  credits: (userId: string, sessionId: string | null) => [...studentQueryKeys.creditsAll(userId), sessionId] as const,
  creditBatches: (userId: string) => [...studentQueryKeys.all(userId), 'credit-batches'] as const,
  payments: (userId: string) => [...studentQueryKeys.all(userId), 'payments'] as const,
  profileAll: (userId: string) => [...studentQueryKeys.all(userId), 'profile'] as const,
  // The account name is the fallback display name, so it is part of the response.
  profile: (userId: string, accountName: string) => [...studentQueryKeys.profileAll(userId), accountName] as const,
  dashboard: (userId: string) => [...studentQueryKeys.all(userId), 'dashboard'] as const,
  membership: (userId: string) => [...studentQueryKeys.all(userId), 'membership'] as const,
  membershipDetails: (userId: string) => [...studentQueryKeys.all(userId), 'membership-details'] as const,
  dashboardGrading: (userId: string) => [...studentQueryKeys.all(userId), 'dashboard-grading'] as const,
  grading: (userId: string) => [...studentQueryKeys.all(userId), 'grading'] as const,
  reference: (userId: string) => [...studentQueryKeys.all(userId), 'reference'] as const,
  classTypes: (userId: string) => [...studentQueryKeys.reference(userId), 'class-types'] as const,
  centres: (userId: string) => [...studentQueryKeys.reference(userId), 'centres'] as const,
  grades: (userId: string) => [...studentQueryKeys.reference(userId), 'grades'] as const,
}

export const studentQueryTimes = {
  schedule: { staleTime: 2 * 60_000, gcTime: 15 * 60_000 },
  credits: { staleTime: 30_000, gcTime: 10 * 60_000 },
  account: { staleTime: 60_000, gcTime: 10 * 60_000 },
  reference: { staleTime: 10 * 60_000, gcTime: 30 * 60_000 },
} as const
