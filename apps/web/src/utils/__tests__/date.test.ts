import { describe, expect, it } from 'vitest'
import { dateOnly, formatDate, formatWeekRange, getMondayOfWeek, toLocalDateStr } from '../date.js'

describe('dateOnly', () => {
  it('strips ISO time from datetime strings', () => {
    expect(dateOnly('2026-05-22T11:37:11.000Z')).toBe('2026-05-22')
  })

  it('keeps date-only strings unchanged', () => {
    expect(dateOnly('2026-05-22')).toBe('2026-05-22')
  })
})

describe('toLocalDateStr', () => {
  it('formats a Date as YYYY-MM-DD using local fields', () => {
    expect(toLocalDateStr(new Date(2026, 4, 2))).toBe('2026-05-02')
  })
})

describe('getMondayOfWeek', () => {
  it('keeps date-only input compatible with the API weekStart format', () => {
    expect(getMondayOfWeek('2026-05-22')).toBe('2026-05-18')
  })

  it('accepts ISO datetimes without producing an invalid weekStart', () => {
    expect(getMondayOfWeek('2026-05-22T11:37:11.000Z')).toBe('2026-05-18')
  })

  it('treats Sunday as part of the preceding Monday-start week', () => {
    expect(getMondayOfWeek('2026-05-24')).toBe('2026-05-18')
  })
})

describe('formatDate', () => {
  it('formats date strings as DD.MM.YY', () => {
    expect(formatDate('2026-05-22')).toBe('22.05.26')
  })
})

describe('formatWeekRange', () => {
  it('formats week ranges within the same month', () => {
    expect(formatWeekRange('2026-05-18')).toBe('18-24.05.26')
  })

  it('formats week ranges across months', () => {
    expect(formatWeekRange('2026-03-30')).toBe('30.03-05.04.26')
  })
})
