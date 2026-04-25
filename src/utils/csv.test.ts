import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('emits plain unquoted fields when no special character is present', () => {
    const out = toCsv(
      [
        ['a', 'b', 'c'],
        ['1', '2', '3'],
      ],
      { separator: ',', quote: '"' },
    )
    expect(out).toBe('a,b,c\r\n1,2,3')
  })

  it('writes the header row first when provided', () => {
    const out = toCsv([['1', '2']], {
      separator: ',',
      quote: '"',
      header: ['x', 'y'],
    })
    expect(out).toBe('x,y\r\n1,2')
  })

  it('quotes fields that contain the separator', () => {
    const out = toCsv([['a,b', 'c']], { separator: ',', quote: '"' })
    expect(out).toBe('"a,b",c')
  })

  it('quotes fields that contain a newline', () => {
    const out = toCsv([['line1\nline2', 'x']], { separator: ',', quote: '"' })
    expect(out).toBe('"line1\nline2",x')
  })

  it('escapes embedded quote characters by doubling them', () => {
    const out = toCsv([['he said "hi"', 'ok']], { separator: ',', quote: '"' })
    expect(out).toBe('"he said ""hi""",ok')
  })

  it('honors a custom separator', () => {
    const out = toCsv([['a;b', 'c']], { separator: ';', quote: '"' })
    expect(out).toBe('"a;b";c')
  })

  it('honors a custom quote character', () => {
    const out = toCsv([["it's", "a,b"]], { separator: ',', quote: "'" })
    expect(out).toBe("'it''s','a,b'")
  })

  it('returns an empty string for no rows and no header', () => {
    expect(toCsv([], { separator: ',', quote: '"' })).toBe('')
  })

  it('throws when separator is not a single character', () => {
    expect(() => toCsv([], { separator: '', quote: '"' })).toThrow(/separator/)
    expect(() => toCsv([], { separator: ',,', quote: '"' })).toThrow(/separator/)
  })

  it('throws when quote is not a single character', () => {
    expect(() => toCsv([], { separator: ',', quote: '' })).toThrow(/quote/)
    expect(() => toCsv([], { separator: ',', quote: '""' })).toThrow(/quote/)
  })

  it('throws when separator equals quote', () => {
    expect(() => toCsv([], { separator: '"', quote: '"' })).toThrow(/different/)
  })
})
