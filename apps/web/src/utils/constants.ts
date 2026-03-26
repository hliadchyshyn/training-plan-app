import type { FeedbackStatus } from '../types/common.js'

export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL:   'Частково',
  SKIPPED:   'Пропущено',
}

/** Vivid colors for small dot indicators (traffic light style) */
export const STATUS_DOT_COLORS: Record<FeedbackStatus, string> = {
  COMPLETED: '#22c55e',
  PARTIAL:   '#f59e0b',
  SKIPPED:   '#ef4444',
}
