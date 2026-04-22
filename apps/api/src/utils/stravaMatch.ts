import type { PrismaClient } from '@prisma/client'

const TYPE_KEYWORDS: Record<string, string[]> = {
  Run: ['біг', 'run', 'пробіжка', 'кросс', 'темп', 'інтервал', 'фартлек'],
  Ride: ['велосипед', 'ride', 'вело', 'шосе', 'mtb'],
  Swim: ['плавання', 'swim', 'басейн', 'вода'],
  Walk: ['ходьба', 'walk', 'прогулянка'],
  Hike: ['похід', 'hike', 'трейл'],
}

function estimateRpeFromHr(avgHr: number | null, maxHr: number | null): number {
  if (!avgHr) return 6
  const ratio = avgHr / (maxHr ?? 185)
  if (ratio < 0.6) return 2
  if (ratio < 0.7) return 4
  if (ratio < 0.8) return 6
  if (ratio < 0.87) return 7
  if (ratio < 0.93) return 8
  if (ratio < 0.97) return 9
  return 10
}

function scoreTypeMatch(activityType: string, text: string | null): number {
  if (!text) return 0
  const lower = text.toLowerCase()
  const keywords = TYPE_KEYWORDS[activityType] ?? []
  return keywords.some((k) => lower.includes(k)) ? 30 : 0
}

function scoreDistanceMatch(activityDistanceM: number, parsedData: unknown): number {
  if (!parsedData || typeof parsedData !== 'object') return 0
  const pd = parsedData as Record<string, unknown>
  const planned = typeof pd.totalDistanceKm === 'number' ? pd.totalDistanceKm * 1000 : null
  if (!planned) return 0
  const ratio = activityDistanceM / planned
  if (ratio >= 0.9 && ratio <= 1.1) return 30 // ±10%
  if (ratio >= 0.8 && ratio <= 1.2) return 20 // ±20%
  return 0
}

export async function matchActivities(athleteId: string, prisma: PrismaClient): Promise<number> {
  const unmatched = await prisma.stravaActivity.findMany({
    where: { athleteId, sessionId: null },
  })

  if (unmatched.length === 0) return 0

  // --- Pre-compute date metadata for every activity ---
  type ActivityMeta = { dateStr: string; dow: number; monday: Date }

  const metas: ActivityMeta[] = unmatched.map((activity) => {
    const activityDate = activity.startDateLocal.toISOString().split('T')[0]
    const dow = activity.startDateLocal.getDay() === 0 ? 7 : activity.startDateLocal.getDay()

    // Build monday as UTC midnight so the key matches weekStart stored in DB (also UTC midnight)
    const [y, mo, da] = activityDate.split('-').map(Number)
    const d = new Date(Date.UTC(y, mo - 1, da))
    const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() - (dayOfWeek - 1))

    return { dateStr: activityDate, dow, monday }
  })

  // --- 2 parallel batch reads ---
  const uniqueDateObjects = [...new Set(metas.map((m) => m.dateStr))].map((s) => new Date(s))
  const uniqueMondays = [...new Map(metas.map((m) => [m.monday.toISOString(), m.monday])).values()]

  const [groupPlanRows, indPlanRows] = await Promise.all([
    prisma.trainingPlan.findMany({
      where: { date: { in: uniqueDateObjects } },
      include: { exerciseGroups: true, sessions: { where: { athleteId } } },
    }),
    prisma.individualPlan.findMany({
      where: { athleteId, weekStart: { in: uniqueMondays } },
      include: { days: { include: { sessions: { where: { athleteId } } } } },
    }),
  ])

  // --- Build O(1) lookup maps ---
  const groupByDate = new Map<string, typeof groupPlanRows>()
  for (const plan of groupPlanRows) {
    const key = plan.date.toISOString().split('T')[0]
    groupByDate.set(key, [...(groupByDate.get(key) ?? []), plan])
  }

  const indByMonday = new Map<string, typeof indPlanRows>()
  for (const plan of indPlanRows) {
    const key = plan.weekStart.toISOString()
    indByMonday.set(key, [...(indByMonday.get(key) ?? []), plan])
  }

  // --- Match in-memory ---
  type Candidate =
    | { type: 'group'; planId: string; exerciseGroupId: string | null; parsedData: unknown; text: string | null; session: { id: string } | null }
    | { type: 'ind'; dayId: string; parsedData: unknown; text: string | null; session: { id: string } | null }

  type MatchResult = {
    activity: (typeof unmatched)[number]
    existingSessionId: string | null
    sessionData:
      | { type: 'group'; planId: string; exerciseGroupId: string | null; date: Date }
      | { type: 'ind'; dayId: string; date: Date }
      | null
    score: number
    rpe: number
  }

  const matchResults: MatchResult[] = []

  for (let i = 0; i < unmatched.length; i++) {
    const activity = unmatched[i]
    const { dateStr, dow, monday } = metas[i]

    const candidates: Array<{ candidate: Candidate; score: number }> = []

    for (const plan of groupByDate.get(dateStr) ?? []) {
      const session = plan.sessions[0] ?? null
      const text = plan.exerciseGroups.map((g) => g.rawText).join(' ')
      const combinedParsed = plan.exerciseGroups[0]?.parsedData ?? null
      const score = 50 + scoreTypeMatch(activity.type, text) + scoreDistanceMatch(activity.distance, combinedParsed)
      candidates.push({ candidate: { type: 'group', planId: plan.id, exerciseGroupId: null, parsedData: combinedParsed, text, session }, score })
    }

    for (const plan of indByMonday.get(monday.toISOString()) ?? []) {
      for (const day of plan.days) {
        if (day.dayOfWeek !== dow) continue
        const session = day.sessions[0] ?? null
        const score = 55 + scoreTypeMatch(activity.type, day.rawText) + scoreDistanceMatch(activity.distance, day.parsedData)
        candidates.push({ candidate: { type: 'ind', dayId: day.id, parsedData: day.parsedData, text: day.rawText, session }, score })
      }
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (best.score < 50) continue

    const rpe = estimateRpeFromHr(activity.averageHeartrate, activity.maxHeartrate)
    const c = best.candidate
    const date = new Date(dateStr)
    const existingSessionId = c.session?.id ?? null
    const sessionData =
      existingSessionId !== null
        ? null
        : c.type === 'group'
          ? { type: 'group' as const, planId: c.planId, exerciseGroupId: c.exerciseGroupId, date }
          : { type: 'ind' as const, dayId: c.dayId, date }

    matchResults.push({ activity, existingSessionId, sessionData, score: best.score, rpe })
  }

  if (matchResults.length === 0) return 0

  // --- Batch write 1: create missing AthleteSession records ---
  const needsSession = matchResults.filter((r) => r.sessionData !== null)
  const createdSessions = await Promise.all(
    needsSession.map((r) => {
      const sd = r.sessionData!
      return sd.type === 'group'
        ? prisma.athleteSession.upsert({
            where: { athleteId_planId_date: { athleteId, planId: sd.planId!, date: sd.date } },
            create: { athleteId, planId: sd.planId, exerciseGroupId: sd.exerciseGroupId, date: sd.date },
            update: {},
          })
        : prisma.athleteSession.upsert({
            where: { athleteId_individualPlanDayId: { athleteId, individualPlanDayId: sd.dayId! } },
            create: { athleteId, individualPlanDayId: sd.dayId, date: sd.date },
            update: {},
          })
    }),
  )

  // Merge existing + newly created session ids into a flat array aligned with matchResults
  let newIdx = 0
  const resolvedIds = matchResults.map((r) =>
    r.existingSessionId !== null ? r.existingSessionId : createdSessions[newIdx++].id,
  )

  // --- Batch write 2: find sessions that already have feedback ---
  const existingFeedbacks = await prisma.sessionFeedback.findMany({
    where: { sessionId: { in: resolvedIds } },
    select: { sessionId: true },
  })
  const withFeedback = new Set(existingFeedbacks.map((f) => f.sessionId))

  // --- Batch write 3: create missing feedbacks + update activities in parallel ---
  await Promise.all([
    ...matchResults
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => !withFeedback.has(resolvedIds[i]))
      .map(({ r, i }) =>
        prisma.sessionFeedback.create({
          data: { sessionId: resolvedIds[i], status: 'COMPLETED', rpe: r.rpe, comment: `Авто-імпорт зі Strava: ${r.activity.name}` },
        }),
      ),
    ...matchResults.map((r, i) =>
      prisma.stravaActivity.update({
        where: { id: r.activity.id },
        data: {
          sessionId: resolvedIds[i],
          matchedAt: new Date(),
          matchConfidence: r.score >= 80 ? 'HIGH' : r.score >= 65 ? 'MEDIUM' : 'LOW',
        },
      }),
    ),
  ])

  return matchResults.length
}
