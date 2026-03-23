/** Reusable Prisma select/include fragments */

export const ATHLETE_SELECT = { id: true, name: true, email: true } as const

export const EXERCISE_GROUPS_INCLUDE = { orderBy: { order: 'asc' as const } }

export const DAYS_INCLUDE = { orderBy: { dayOfWeek: 'asc' as const } }

export const IND_PLAN_DAYS_INCLUDE = {
  include: {
    sessions: {
      include: { feedback: true },
    },
  },
  orderBy: { dayOfWeek: 'asc' as const },
}
