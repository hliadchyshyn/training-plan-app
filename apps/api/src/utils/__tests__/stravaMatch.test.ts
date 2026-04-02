import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matchActivities } from '../stravaMatch.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    athleteId: 'athlete-1',
    sessionId: null,
    name: 'Morning Run',
    type: 'Run',
    startDateLocal: new Date('2024-06-10T08:00:00Z'), // Monday 2024-06-10
    distance: 10000,
    averageHeartrate: 155,
    maxHeartrate: 185,
    ...overrides,
  }
}

function makeGroupPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-group-1',
    date: new Date('2024-06-10T00:00:00Z'),
    exerciseGroups: [
      {
        id: 'eg-1',
        rawText: 'Легкий біг 10 км',
        parsedData: { totalDistanceKm: 10 },
      },
    ],
    sessions: [],
    ...overrides,
  }
}

function makeIndividualPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-ind-1',
    athleteId: 'athlete-1',
    weekStart: new Date('2024-06-10T00:00:00Z'), // Monday
    days: [
      {
        id: 'day-1',
        dayOfWeek: 1, // Monday
        rawText: 'Темповий біг 10 км',
        parsedData: { totalDistanceKm: 10 },
        sessions: [],
      },
    ],
    ...overrides,
  }
}

function makePrisma(overrides: Partial<ReturnType<typeof buildDefaultPrisma>> = {}) {
  return { ...buildDefaultPrisma(), ...overrides } as unknown as import('@prisma/client').PrismaClient
}

function buildDefaultPrisma() {
  return {
    stravaActivity: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    trainingPlan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    individualPlan: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    athleteSession: {
      create: vi.fn().mockResolvedValue({ id: 'session-new-1' }),
    },
    sessionFeedback: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchActivities', () => {
  const ATHLETE = 'athlete-1'

  describe('early exits', () => {
    it('returns 0 when there are no unmatched activities', async () => {
      const prisma = makePrisma()
      const result = await matchActivities(ATHLETE, prisma)

      expect(result).toBe(0)
      expect(prisma.trainingPlan.findMany).not.toHaveBeenCalled()
    })

    it('returns 0 when no plans exist for those dates', async () => {
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
      })
      const result = await matchActivities(ATHLETE, prisma)

      expect(result).toBe(0)
      expect(prisma.athleteSession.create).not.toHaveBeenCalled()
    })
  })

  describe('group plan matching', () => {
    it('matches activity to a group plan on the same date and creates session + feedback', async () => {
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([makeGroupPlan()]),
        },
      })

      const result = await matchActivities(ATHLETE, prisma)

      expect(result).toBe(1)
      expect(prisma.athleteSession.create).toHaveBeenCalledOnce()
      expect(prisma.athleteSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ athleteId: ATHLETE, planId: 'plan-group-1' }) }),
      )
      expect(prisma.sessionFeedback.create).toHaveBeenCalledOnce()
      expect(prisma.stravaActivity.update).toHaveBeenCalledOnce()
    })

    it('reuses existing session instead of creating a new one', async () => {
      const plan = makeGroupPlan({ sessions: [{ id: 'existing-session-1' }] })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.athleteSession.create).not.toHaveBeenCalled()
      expect(prisma.stravaActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sessionId: 'existing-session-1' }),
        }),
      )
    })

    it('skips feedback creation when feedback already exists', async () => {
      const plan = makeGroupPlan({ sessions: [{ id: 'sess-1' }] })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
        sessionFeedback: {
          findMany: vi.fn().mockResolvedValue([{ sessionId: 'sess-1' }]),
          create: vi.fn().mockResolvedValue({}),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.create).not.toHaveBeenCalled()
    })
  })

  describe('individual plan matching', () => {
    it('matches activity to an individual plan for the correct day-of-week', async () => {
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]), // Monday
          update: vi.fn().mockResolvedValue({}),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([makeIndividualPlan()]),
        },
      })

      const result = await matchActivities(ATHLETE, prisma)

      expect(result).toBe(1)
      expect(prisma.athleteSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ individualPlanDayId: 'day-1' }) }),
      )
    })

    it('skips individual plan days that do not match the activity day-of-week', async () => {
      // Activity is Monday (dow=1) but plan day is Wednesday (dow=3)
      const plan = makeIndividualPlan({
        days: [{ id: 'day-3', dayOfWeek: 3, rawText: 'Біг', parsedData: {}, sessions: [] }],
      })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      const result = await matchActivities(ATHLETE, prisma)

      expect(result).toBe(0)
    })
  })

  describe('scoring and confidence', () => {
    it('prefers individual plan over group plan when both match (individual gets +5 bonus)', async () => {
      // Both have same date/type/distance — individual wins by +5 score
      const groupPlan = makeGroupPlan()
      const indPlan = makeIndividualPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([groupPlan]),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([indPlan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      // Session should be created for individual plan day, not group plan
      expect(prisma.athleteSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ individualPlanDayId: 'day-1' }) }),
      )
    })

    it('sets matchConfidence HIGH when score >= 80 (date + type + distance match)', async () => {
      // score = 50 (date) + 5 (ind bonus) + 30 (type) = 85 → HIGH if distance also matches
      const plan = makeIndividualPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ type: 'Run', distance: 10000 })]),
          update: vi.fn().mockResolvedValue({}),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.stravaActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchConfidence: 'HIGH' }),
        }),
      )
    })

    it('sets matchConfidence MEDIUM when score is 65–79', async () => {
      // score = 50 (date) + 5 (ind) + 0 (type mismatch) + 20 (±20% distance) = 75 → MEDIUM
      const plan = makeIndividualPlan({
        days: [
          {
            id: 'day-1',
            dayOfWeek: 1,
            rawText: 'Велосипед', // won't match Run keywords
            parsedData: { totalDistanceKm: 11.5 }, // 10000/11500 = 0.87 → ±20% → +20
            sessions: [],
          },
        ],
      })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ type: 'Run', distance: 10000 })]),
          update: vi.fn().mockResolvedValue({}),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.stravaActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchConfidence: 'MEDIUM' }),
        }),
      )
    })

    it('sets matchConfidence LOW when score is 50–64 (date match only)', async () => {
      // score = 50 (date) + 5 (ind) = 55 → LOW
      const plan = makeIndividualPlan({
        days: [
          {
            id: 'day-1',
            dayOfWeek: 1,
            rawText: 'Відпочинок',  // no keyword match
            parsedData: {},         // no distance
            sessions: [],
          },
        ],
      })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity()]),
          update: vi.fn().mockResolvedValue({}),
        },
        individualPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.stravaActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ matchConfidence: 'LOW' }),
        }),
      )
    })
  })

  describe('RPE estimation from heart rate', () => {
    it('writes rpe=6 when no heart rate data', async () => {
      const plan = makeGroupPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ averageHeartrate: null, maxHeartrate: null })]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rpe: 6 }) }),
      )
    })

    it('writes rpe=2 for low-intensity HR (ratio < 0.6)', async () => {
      // avgHr=100, maxHr=185 → ratio≈0.54 → rpe=2
      const plan = makeGroupPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ averageHeartrate: 100, maxHeartrate: 185 })]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rpe: 2 }) }),
      )
    })

    it('writes rpe=10 for maximal HR (ratio >= 0.97)', async () => {
      // avgHr=181, maxHr=185 → ratio≈0.978 → rpe=10
      const plan = makeGroupPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ averageHeartrate: 181, maxHeartrate: 185 })]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: {
          findMany: vi.fn().mockResolvedValue([plan]),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ rpe: 10 }) }),
      )
    })
  })

  describe('batch efficiency', () => {
    it('issues exactly 2 read queries for plans regardless of activity count', async () => {
      const activities = [
        makeActivity({ id: 'act-1', startDateLocal: new Date('2024-06-10T08:00:00Z') }),
        makeActivity({ id: 'act-2', startDateLocal: new Date('2024-06-12T08:00:00Z') }),
        makeActivity({ id: 'act-3', startDateLocal: new Date('2024-06-14T08:00:00Z') }),
      ]
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue(activities),
          update: vi.fn().mockResolvedValue({}),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.trainingPlan.findMany).toHaveBeenCalledOnce()
      expect(prisma.individualPlan.findMany).toHaveBeenCalledOnce()
    })

    it('passes all unique dates to trainingPlan query in a single call', async () => {
      const activities = [
        makeActivity({ id: 'act-1', startDateLocal: new Date('2024-06-10T08:00:00Z') }),
        makeActivity({ id: 'act-2', startDateLocal: new Date('2024-06-12T08:00:00Z') }),
      ]
      const trainingPlanFindMany = vi.fn().mockResolvedValue([])
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue(activities),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: { findMany: trainingPlanFindMany },
      })

      await matchActivities(ATHLETE, prisma)

      const callArg = trainingPlanFindMany.mock.calls[0][0]
      expect(callArg.where.date.in).toHaveLength(2)
    })

    it('issues 1 sessionFeedback.findMany for all matched activities', async () => {
      const activities = [
        makeActivity({ id: 'act-1', startDateLocal: new Date('2024-06-10T08:00:00Z') }),
        makeActivity({ id: 'act-2', startDateLocal: new Date('2024-06-11T08:00:00Z') }),
      ]
      const plans = [
        makeGroupPlan({ id: 'gp-1', date: new Date('2024-06-10T00:00:00Z') }),
        makeGroupPlan({ id: 'gp-2', date: new Date('2024-06-11T00:00:00Z') }),
      ]
      let sessIdx = 0
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue(activities),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: { findMany: vi.fn().mockResolvedValue(plans) },
        athleteSession: {
          create: vi.fn().mockImplementation(() => Promise.resolve({ id: `sess-${++sessIdx}` })),
        },
        sessionFeedback: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({}),
        },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.findMany).toHaveBeenCalledOnce()
    })
  })

  describe('type keyword matching', () => {
    it('gives 30 pts bonus when activity type matches plan text keywords', async () => {
      // "ride" keyword present → 30 pts for Ride type
      const plan = makeGroupPlan({
        exerciseGroups: [{ id: 'eg-1', rawText: 'Шосейна ride 50 км', parsedData: {} }],
      })
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ type: 'Ride', distance: 50000 })]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: { findMany: vi.fn().mockResolvedValue([plan]) },
      })

      await matchActivities(ATHLETE, prisma)

      // Should match — score = 50+30 = 80 → HIGH
      expect(prisma.stravaActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ matchConfidence: 'HIGH' }) }),
      )
    })
  })

  describe('feedback comment', () => {
    it('sets Strava import comment with activity name', async () => {
      const plan = makeGroupPlan()
      const prisma = makePrisma({
        stravaActivity: {
          findMany: vi.fn().mockResolvedValue([makeActivity({ name: 'Easy 10k' })]),
          update: vi.fn().mockResolvedValue({}),
        },
        trainingPlan: { findMany: vi.fn().mockResolvedValue([plan]) },
      })

      await matchActivities(ATHLETE, prisma)

      expect(prisma.sessionFeedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ comment: 'Авто-імпорт зі Strava: Easy 10k' }),
        }),
      )
    })
  })
})
