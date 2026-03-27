export type Role = 'ATHLETE' | 'TRAINER' | 'ADMIN'
export type PlanType = 'GROUP' | 'INDIVIDUAL'
export type FeedbackStatus = 'COMPLETED' | 'PARTIAL' | 'SKIPPED'

export interface WorkoutBlock {
  sets?: number
  distance?: string
  duration?: string
  rest?: string
  series?: number
  seriesRest?: string
  intensity?: string
}

export interface PaceInfo {
  general?: string
  men?: string
  women?: string
  levels?: Record<string, string>
}

export interface ParsedWorkout {
  blocks: WorkoutBlock[]
  pace?: PaceInfo
  notes?: string
}

// Watch workout types
export type WatchStepType =
  | 'WARMUP'
  | 'ACTIVE'
  | 'RECOVERY'
  | 'COOLDOWN'
  | 'REST'
  | 'REPEAT_BEGIN'
  | 'REPEAT_END'

export type WatchDurationUnit = 'TIME' | 'DISTANCE' | 'OPEN'
export type WatchTargetUnit = 'PACE' | 'HEART_RATE_ZONE' | 'OPEN'
export type WatchSport = 'RUNNING' | 'CYCLING' | 'SWIMMING'

export interface WatchWorkoutStep {
  type: WatchStepType
  durationUnit: WatchDurationUnit
  durationValue?: number   // seconds or meters
  targetUnit: WatchTargetUnit
  targetFrom?: number      // pace seconds/km or HR zone number
  targetTo?: number
  repeatCount?: number     // only for REPEAT_BEGIN
  name?: string
}

// Auth DTOs
export interface RegisterDto {
  email: string
  name: string
  password: string
}

export interface LoginDto {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  user: {
    id: string
    email: string
    name: string
    role: Role
  }
}

// Plan DTOs
export interface CreateGroupPlanDto {
  date: string // ISO date
  teamId: string
  title?: string
  notes?: string
  groups: Array<{
    name: string
    rawText: string
    order: number
  }>
}

export interface CreateIndividualPlanDto {
  athleteId: string
  weekStart: string // ISO date (Monday)
  notes?: string
  days: Array<{
    dayOfWeek: number // 1-7
    rawText?: string
  }>
}

export interface SessionFeedbackDto {
  status: FeedbackStatus
  rpe: number // 1-10
  comment?: string
}
