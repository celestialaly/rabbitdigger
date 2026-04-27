import { describe, it, expect } from 'vitest'
import { isBase64, BASE64_REGEX } from './isBase64'

describe('isBase64', () => {
  it('accepts typical base64 strings (with and without padding)', () => {
    expect(isBase64('SGVsbG8=')).toBe(true) // "Hello"
    expect(isBase64('SGVsbG8gd29ybGQ=')).toBe(true) // "Hello world"
    expect(isBase64('YWJjZA==')).toBe(true) // "abcd"
    expect(isBase64('YWJj')).toBe(true) // "abc" with no padding needed
  })

  it('accepts base64 with `+` and `/` from the standard alphabet', () => {
    expect(isBase64('ab+/cd==')).toBe(true)
    expect(isBase64('++//==')).toBe(false) // length 6, not multiple of 4
    expect(isBase64('++//AAAA')).toBe(true)
  })

  it('rejects the empty string', () => {
    expect(isBase64('')).toBe(false)
  })

  it('rejects strings whose length is not a multiple of 4', () => {
    expect(isBase64('abc')).toBe(false)
    expect(isBase64('abcde')).toBe(false)
    expect(isBase64('SGVsbG8')).toBe(false)
  })

  it('rejects strings with characters outside the base64 alphabet', () => {
    expect(isBase64('hello world!!')).toBe(false)
    expect(isBase64('plain te')).toBe(false) // contains a space
    expect(isBase64('abc-')).toBe(false) // url-safe alphabet not accepted
    expect(isBase64('abc_')).toBe(false)
  })

  it('rejects padding in the wrong place', () => {
    expect(isBase64('=AAA')).toBe(false)
    expect(isBase64('A=AA')).toBe(false)
    expect(isBase64('AA=A')).toBe(false)
    expect(isBase64('====')).toBe(false)
  })
})

describe('BASE64_REGEX', () => {
  it('is exposed for callers that need raw pattern matching', () => {
    expect(BASE64_REGEX.test('SGVsbG8=')).toBe(true)
    expect(BASE64_REGEX.test('not base64!')).toBe(false)
  })
})
