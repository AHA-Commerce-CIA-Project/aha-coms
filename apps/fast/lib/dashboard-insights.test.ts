import { describe, expect, it } from 'bun:test'

import { computeDashboardInsights } from './dashboard-insights'

const ANCHOR = new Date('2026-05-15T00:00:00.000Z')
const weekStart = new Date('2026-05-10T00:00:00.000Z') // Sunday — matches Date#getDay() = 0

describe('computeDashboardInsights', () => {
  it('derives completion stats from status groupBy buckets', () => {
    const out = computeDashboardInsights({
      statusGroups: [
        { status: 'done', _count: { _all: 7 } },
        { status: 'in-progress', _count: { _all: 2 } },
        { status: 'todo', _count: { _all: 1 } },
      ],
      urgencyGroups: [],
      completedTasksTime: [],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })

    expect(out.stats.completed).toBe(7)
    expect(out.stats.active).toBe(3)
    expect(out.stats.total).toBe(10)
    expect(out.insights.completionRate).toBe(70)
  })

  it('rolls urgency groupBy into the breakdown and coerces null to Unset', () => {
    const out = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [
        { urgency: 'P1', _count: { _all: 3 } },
        { urgency: 'P3', _count: { _all: 4 } },
        { urgency: null, _count: { _all: 2 } },
      ],
      completedTasksTime: [],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })

    expect(out.insights.urgencyBreakdown).toEqual({ P1: 3, P3: 4, Unset: 2 })
  })

  it('averages resolution hours from bounded completed-task timings', () => {
    const out = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [
        // 6-hour resolution
        { createdAt: new Date('2026-05-13T00:00:00Z'), completedAt: new Date('2026-05-13T06:00:00Z'), difficultyScore: 3 },
        // 18-hour resolution
        { createdAt: new Date('2026-05-12T00:00:00Z'), completedAt: new Date('2026-05-12T18:00:00Z'), difficultyScore: 4 },
      ],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })

    // average = (6 + 18) / 2 = 12 hours
    expect(out.insights.avgResolutionHours).toBe(12)
    // average difficulty = (3 + 4) / 2 = 3.5
    expect(out.insights.avgDifficulty).toBe(3.5)
  })

  it('counts this-week completions from completedAt >= weekStart', () => {
    const out = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [
        // before weekStart (2026-05-10) — excluded
        { createdAt: new Date('2026-05-05T00:00:00Z'), completedAt: new Date('2026-05-08T00:00:00Z'), difficultyScore: null },
        // on weekStart — included
        { createdAt: new Date('2026-05-09T00:00:00Z'), completedAt: new Date('2026-05-10T12:00:00Z'), difficultyScore: null },
        // mid-week — included
        { createdAt: new Date('2026-05-12T00:00:00Z'), completedAt: new Date('2026-05-13T00:00:00Z'), difficultyScore: null },
      ],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })

    expect(out.insights.thisWeekCompleted).toBe(2)
  })

  it('collapses orbit claim counts into total + completed from one groupBy', () => {
    const out = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [],
      orbitGroups: [
        { status: 'claimed', _count: { _all: 4 } },
        { status: 'completed', _count: { _all: 11 } },
        { status: 'abandoned', _count: { _all: 2 } },
      ],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })

    expect(out.insights.orbitClaims).toBe(17)
    expect(out.insights.orbitCompleted).toBe(11)
  })

  it('averages task reviews and returns null when there are none', () => {
    const a = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [],
      orbitGroups: [],
      reviews: [{ rating: 5 }, { rating: 4 }, { rating: 5 }],
      weekStart,
      now: ANCHOR,
    })
    expect(a.insights.avgRating).toBe(4.7)
    expect(a.insights.totalReviews).toBe(3)

    const b = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })
    expect(b.insights.avgRating).toBeNull()
    expect(b.insights.totalReviews).toBe(0)
  })

  it('returns zeroed stats when every input is empty (no tasks, no claims, no reviews)', () => {
    const out = computeDashboardInsights({
      statusGroups: [],
      urgencyGroups: [],
      completedTasksTime: [],
      orbitGroups: [],
      reviews: [],
      weekStart,
      now: ANCHOR,
    })
    expect(out.stats).toEqual({ completed: 0, active: 0, total: 0 })
    expect(out.insights.completionRate).toBe(0)
    expect(out.insights.avgResolutionHours).toBe(0)
    expect(out.insights.avgDifficulty).toBeNull()
    expect(out.insights.thisWeekCompleted).toBe(0)
    expect(out.insights.orbitClaims).toBe(0)
    expect(out.insights.orbitCompleted).toBe(0)
    expect(out.insights.avgRating).toBeNull()
    expect(out.insights.totalReviews).toBe(0)
  })
})
