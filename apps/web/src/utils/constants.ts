import type { FeedbackStatus } from '../types/common.js'

export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  COMPLETED: 'Виконано',
  PARTIAL:   'Частково',
  SKIPPED:   'Пропущено',
}
