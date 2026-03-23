import type { FeedbackStatus } from '@training-plan/shared'

export type { FeedbackStatus }

export interface Feedback {
  status: FeedbackStatus
  rpe: number
  comment: string | null
}

export interface Session {
  id: string
  exerciseGroupId: string | null
  feedback: Feedback | null
}

export interface ExerciseGroup {
  id: string
  name: string
  rawText: string
  parsedData: unknown
}
