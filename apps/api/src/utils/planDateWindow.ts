export interface PlanDateWindowQuery {
  date?: string
  tab?: 'upcoming' | 'past'
  month?: string
}

export interface PlanDateWindow {
  dateFilter: Record<string, Date>
  indDateFilter: Record<string, Date>
}

/**
 * Resolve the GET /plans date window from query params.
 *
 * When `date` is set, both filters stay empty: the legacy single-date path in the
 * route builds its own equality filter for group plans and intentionally leaves
 * individual plans unfiltered by date (a trainer-dashboard "today" view that always
 * shows all of a trainer's individual plans).
 */
export function resolvePlanDateWindow(query: PlanDateWindowQuery): PlanDateWindow {
  if (query.month) {
    const [y, m] = query.month.split('-').map(Number)
    const dateFilter = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) }
    return { dateFilter, indDateFilter: dateFilter }
  }

  if (query.date && query.tab !== 'past') return { dateFilter: {}, indDateFilter: {} }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6)

  return query.tab === 'past'
    ? { dateFilter: { lt: today }, indDateFilter: { lt: weekAgo } }
    : { dateFilter: { gte: today }, indDateFilter: { gte: weekAgo } }
}
