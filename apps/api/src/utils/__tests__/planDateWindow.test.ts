import { describe, expect, it, vi } from 'vitest'
import { resolvePlanDateWindow } from '../planDateWindow.js'

describe('resolvePlanDateWindow', () => {
  it('builds a month window from ?month, shared by both filters', () => {
    const { dateFilter, indDateFilter } = resolvePlanDateWindow({ month: '2026-03' })
    expect(dateFilter).toEqual({ gte: new Date(2026, 2, 1), lt: new Date(2026, 3, 1) })
    expect(indDateFilter).toEqual(dateFilter)
  })

  it('builds a past window from ?tab=past, with a week-back offset for individual plans', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 30))

    const { dateFilter, indDateFilter } = resolvePlanDateWindow({ tab: 'past' })
    expect(dateFilter).toEqual({ lt: new Date(2026, 5, 15, 0, 0, 0, 0) })
    expect(indDateFilter).toEqual({ lt: new Date(2026, 5, 9, 0, 0, 0, 0) })

    vi.useRealTimers()
  })

  it('defaults to an upcoming window when no date/tab/month is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 30))

    const { dateFilter, indDateFilter } = resolvePlanDateWindow({})
    expect(dateFilter).toEqual({ gte: new Date(2026, 5, 15, 0, 0, 0, 0) })
    expect(indDateFilter).toEqual({ gte: new Date(2026, 5, 9, 0, 0, 0, 0) })

    vi.useRealTimers()
  })

  it('leaves both filters empty on the legacy single-date path', () => {
    expect(resolvePlanDateWindow({ date: '2026-06-15' })).toEqual({ dateFilter: {}, indDateFilter: {} })
  })

  it('prefers month over tab when both are present', () => {
    const { dateFilter } = resolvePlanDateWindow({ month: '2026-01', tab: 'past' })
    expect(dateFilter).toEqual({ gte: new Date(2026, 0, 1), lt: new Date(2026, 1, 1) })
  })
})
