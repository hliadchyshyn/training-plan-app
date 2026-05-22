import { describe, expect, it } from 'vitest'
import { DAY_NAMES, STATUS_DOT_COLORS, STATUS_LABELS } from '../constants.js'

describe('constants', () => {
  it('exposes localized day and feedback labels', () => {
    expect(DAY_NAMES).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'])
    expect(STATUS_LABELS.COMPLETED).toBe('Виконано')
    expect(STATUS_DOT_COLORS.SKIPPED).toBe('#ef4444')
  })
})
