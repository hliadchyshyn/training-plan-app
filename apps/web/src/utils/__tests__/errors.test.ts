import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../errors.js'

describe('getErrorMessage', () => {
  it('prefers validation detail messages', () => {
    expect(getErrorMessage({ response: { data: { details: [{ message: 'Invalid weekStart' }] } } })).toBe('Invalid weekStart')
  })

  it('falls back to API error and default text', () => {
    expect(getErrorMessage({ response: { data: { error: 'Server failed' } } })).toBe('Server failed')
    expect(getErrorMessage({}, 'Fallback')).toBe('Fallback')
  })
})
