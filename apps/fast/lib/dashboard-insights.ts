export type TaskStatusGroup = { status: string | null; _count: { _all: number } }
export type TaskUrgencyGroup = { urgency: string | null; _count: { _all: number } }
export type OrbitClaimGroup = { status: string | null; _count: { _all: number } }
export type CompletedTaskTime = {
  createdAt: Date
  completedAt: Date | null
  difficultyScore: number | null
}

export type DashboardInsightsInput = {
  statusGroups: TaskStatusGroup[]
  urgencyGroups: TaskUrgencyGroup[]
  completedTasksTime: CompletedTaskTime[]
  orbitGroups: OrbitClaimGroup[]
  reviews: { rating: number }[]
  weekStart: Date
  now: Date
}

export type DashboardStats = { completed: number; active: number; total: number }

export type DashboardInsights = {
  completionRate: number
  avgResolutionHours: number
  avgDifficulty: number | null
  urgencyBreakdown: Record<string, number>
  thisWeekCompleted: number
  orbitClaims: number
  orbitCompleted: number
  avgRating: number | null
  totalReviews: number
}

export function computeDashboardInsights(input: DashboardInsightsInput): {
  stats: DashboardStats
  insights: DashboardInsights
} {
  const completed = input.statusGroups.find((g) => g.status === 'done')?._count._all ?? 0
  const total = input.statusGroups.reduce((sum, g) => sum + g._count._all, 0)
  const active = total - completed
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const urgencyBreakdown: Record<string, number> = {}
  for (const g of input.urgencyGroups) {
    const key = g.urgency ?? 'Unset'
    urgencyBreakdown[key] = (urgencyBreakdown[key] ?? 0) + g._count._all
  }

  let avgResolutionHours = 0
  if (input.completedTasksTime.length > 0) {
    const totalMs = input.completedTasksTime.reduce(
      (sum, t) =>
        sum +
        (t.completedAt ? t.completedAt.getTime() - t.createdAt.getTime() : 0),
      0,
    )
    avgResolutionHours = Math.round(totalMs / input.completedTasksTime.length / 3600000)
  }

  const withDifficulty = input.completedTasksTime.filter((t) => t.difficultyScore !== null)
  const avgDifficulty =
    withDifficulty.length > 0
      ? Math.round(
          (withDifficulty.reduce((s, t) => s + (t.difficultyScore ?? 0), 0) /
            withDifficulty.length) *
            10,
        ) / 10
      : null

  const thisWeekCompleted = input.completedTasksTime.filter(
    (t) => t.completedAt && t.completedAt.getTime() >= input.weekStart.getTime(),
  ).length

  const orbitClaims = input.orbitGroups.reduce((sum, g) => sum + g._count._all, 0)
  const orbitCompleted =
    input.orbitGroups.find((g) => g.status === 'completed')?._count._all ?? 0

  const avgRating =
    input.reviews.length > 0
      ? Math.round(
          (input.reviews.reduce((sum, r) => sum + r.rating, 0) / input.reviews.length) * 10,
        ) / 10
      : null
  const totalReviews = input.reviews.length

  return {
    stats: { completed, active, total },
    insights: {
      completionRate,
      avgResolutionHours,
      avgDifficulty,
      urgencyBreakdown,
      thisWeekCompleted,
      orbitClaims,
      orbitCompleted,
      avgRating,
      totalReviews,
    },
  }
}
