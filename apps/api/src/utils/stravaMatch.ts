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

  let matched = 0

  for (const activity of unmatched) {
    const activityDate = activity.startDateLocal.toISOString().split('T')[0]
    const dow = activity.startDateLocal.getDay() === 0 ? 7 : activity.startDateLocal.getDay()

    // Candidate 1: group plan on that date
    const groupPlans = await prisma.trainingPlan.findMany({
      where: { date: new Date(activityDate) },
      include: { exerciseGroups: true, sessions: { where: { athleteId } } },
    })

    // Candidate 2: individual plan day for that dow in week containing activityDate
    const [y, mo, da] = activityDate.split('-').map(Number)
    const d = new Date(y, mo - 1, da)
    const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay()
    const mondayOffset = dayOfWeek - 1
    const monday = new Date(d)
    monday.setDate(d.getDate() - mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const indPlans = await prisma.individualPlan.findMany({
      where: {
        athleteId,
        weekStart: { gte: monday, lte: sunday },
      },
      include: { days: { where: { dayOfWeek: dow }, include: { sessions: { where: { athleteId } } } } },
    })

    type Candidate =
      | { type: 'group'; planId: string; exerciseGroupId: string | null; parsedData: unknown; text: string | null; session: { id: string } | null }
      | { type: 'ind'; dayId: string; parsedData: unknown; text: string | null; session: { id: string } | null }

    const candidates: Array<{ candidate: Candidate; score: number }> = []

    for (const plan of groupPlans) {
      const session = plan.sessions[0] ?? null
      const text = plan.exerciseGroups.map((g) => g.rawText).join(' ')
      let score = 50 // date match
      score += scoreTypeMatch(activity.type, text)
      const combinedParsed = plan.exerciseGroups[0]?.parsedData ?? null
      score += scoreDistanceMatch(activity.distance, combinedParsed)
      candidates.push({
        candidate: { type: 'group', planId: plan.id, exerciseGroupId: null, parsedData: combinedParsed, text, session },
        score,
      })
    }

    for (const plan of indPlans) {
      for (const day of plan.days) {
        const session = day.sessions[0] ?? null
        let score = 50 // date match
        score += 5 // prefer individual
        score += scoreTypeMatch(activity.type, day.rawText)
        score += scoreDistanceMatch(activity.distance, day.parsedData)
        candidates.push({
          candidate: { type: 'ind', dayId: day.id, parsedData: day.parsedData, text: day.rawText, session },
          score,
        })
      }
    }

    if (candidates.length === 0) continue

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (best.score < 50) continue

    const rpe = estimateRpeFromHr(activity.averageHeartrate, activity.maxHeartrate)
    const comment = `Авто-імпорт зі Strava: ${activity.name}`
    const c = best.candidate

    // Ensure AthleteSession exists
    let sessionId: string

    if (c.type === 'group') {
      if (c.session) {
        sessionId = c.session.id
      } else {
        const sess = await prisma.athleteSession.create({
          data: {
            athleteId,
            planId: c.planId,
            exerciseGroupId: c.exerciseGroupId,
            date: new Date(activityDate),
          },
        })
        sessionId = sess.id
      }
    } else {
      if (c.session) {
        sessionId = c.session.id
      } else {
        const sess = await prisma.athleteSession.create({
          data: {
            athleteId,
            individualPlanDayId: c.dayId,
            date: new Date(activityDate),
          },
        })
        sessionId = sess.id
      }
    }

    // Auto-create feedback only if none exists
    const existingFeedback = await prisma.sessionFeedback.findUnique({ where: { sessionId } })
    if (!existingFeedback) {
      await prisma.sessionFeedback.create({
        data: { sessionId, status: 'COMPLETED', rpe, comment },
      })
    }

    // Link activity to session
    await prisma.stravaActivity.update({
      where: { id: activity.id },
      data: {
        sessionId,
        matchedAt: new Date(),
        matchConfidence: best.score >= 80 ? 'HIGH' : best.score >= 65 ? 'MEDIUM' : 'LOW',
      },
    })

    matched++
  }

  return matched
}
