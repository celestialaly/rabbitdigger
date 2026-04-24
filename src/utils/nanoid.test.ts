import { describe, it, expect } from 'vitest'
import { nanoid } from './nanoid'

describe('nanoid', () => {
  it('returns a string of the requested length', () => {
    expect(nanoid(12)).toHaveLength(12)
    expect(nanoid(8)).toHaveLength(8)
  })

  it('defaults to length 12', () => {
    expect(nanoid()).toHaveLength(12)
  })

  it('produces distinct ids on repeated calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()))
    expect(ids.size).toBe(100)
  })
})
