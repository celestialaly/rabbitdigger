import { describe, it, expect } from 'vitest'
import {
  parseCsv,
  detectHeader,
  validateAndMapRows,
  EXPECTED_COLUMNS,
  CsvParseError,
} from './csvImport'

const HEADER = EXPECTED_COLUMNS as readonly string[]

describe('parseCsv', () => {
  it('parses a simple comma-separated CSV', () => {
    const out = parseCsv('a,b,c\r\nd,e,f', { separator: ',', quote: '"' })
    expect(out).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ])
  })

  it('handles quoted fields with embedded separator and quote', () => {
    const csv = '"a,b","c""d",e'
    expect(parseCsv(csv, { separator: ',', quote: '"' })).toEqual([['a,b', 'c"d', 'e']])
  })

  it('handles quoted fields containing CRLF and LF', () => {
    const csv = 'x,"line1\nline2",z\r\n1,"a\r\nb",3'
    expect(parseCsv(csv, { separator: ',', quote: '"' })).toEqual([
      ['x', 'line1\nline2', 'z'],
      ['1', 'a\r\nb', '3'],
    ])
  })

  it('drops a single trailing newline', () => {
    expect(parseCsv('a,b\r\nc,d\r\n', { separator: ',', quote: '"' })).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('returns [] on empty input', () => {
    expect(parseCsv('', { separator: ',', quote: '"' })).toEqual([])
  })

  it('honours a custom separator and quote', () => {
    const csv = "'a;b';'c''d';e"
    expect(parseCsv(csv, { separator: ';', quote: "'" })).toEqual([['a;b', "c'd", 'e']])
  })

  it('throws CsvParseError on an unterminated quoted field', () => {
    expect(() => parseCsv('a,"unterminated', { separator: ',', quote: '"' })).toThrow(
      CsvParseError,
    )
  })

  it('throws CsvParseError on a stray character after a closing quote', () => {
    expect(() => parseCsv('"abc"x,y', { separator: ',', quote: '"' })).toThrow(CsvParseError)
  })

  it('throws CsvParseError on a quote in the middle of an unquoted field', () => {
    expect(() => parseCsv('ab"cd,ef', { separator: ',', quote: '"' })).toThrow(CsvParseError)
  })

  it('rejects a non-single-character separator or quote', () => {
    expect(() => parseCsv('a,b', { separator: ',,', quote: '"' })).toThrow()
    expect(() => parseCsv('a,b', { separator: ',', quote: '' })).toThrow()
    expect(() => parseCsv('a,b', { separator: ',', quote: ',' })).toThrow()
  })
})

describe('detectHeader', () => {
  it('detects the canonical export header', () => {
    expect(detectHeader(HEADER)).toBe(true)
  })

  it('tolerates surrounding whitespace in header cells', () => {
    expect(detectHeader([' id', 'size ', 'body', 'routing key', 'source queue', 'source exchange'])).toBe(
      true,
    )
  })

  it('rejects a row of the wrong length', () => {
    expect(detectHeader(['id', 'size'])).toBe(false)
  })

  it('rejects a row with reordered columns', () => {
    expect(detectHeader(['size', 'id', 'body', 'routing key', 'source queue', 'source exchange'])).toBe(
      false,
    )
  })

  it('returns false for undefined or empty input', () => {
    expect(detectHeader(undefined)).toBe(false)
    expect(detectHeader([])).toBe(false)
  })
})

describe('validateAndMapRows', () => {
  it('skips a detected header and maps remaining rows', () => {
    const result = validateAndMapRows([
      HEADER,
      ['msg-1', '5', 'hello', 'rk', 'q', 'ex'],
      ['', '0', '', 'rk', 'q', 'ex'],
    ])
    expect(result.hasHeader).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      { line: 2, id: 'msg-1', body: 'hello', payloadEncoding: 'string' },
      { line: 3, id: '', body: '', payloadEncoding: 'string' },
    ])
  })

  it('treats the first row as data when it does not match the header', () => {
    const result = validateAndMapRows([
      ['msg-1', '5', 'hello', 'rk', 'q', 'ex'],
      ['msg-2', '5', 'world', 'rk', 'q', 'ex'],
    ])
    expect(result.hasHeader).toBe(false)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].line).toBe(1)
    expect(result.rows[1].line).toBe(2)
  })

  it('uses size to disambiguate short ASCII bodies that look like base64', () => {
    // Regression: 'test', '4567', 'food' are all 4-char strings in the base64
    // alphabet whose length is a multiple of 4 — the syntactic heuristic
    // alone wrongly classifies them as base64. Size === utf8ByteLength(body)
    // proves they are plain strings.
    const result = validateAndMapRows([
      ['', '4', 'test', 'rk', 'q', 'ex'],
      ['', '4', '4567', 'rk', 'q', 'ex'],
      ['', '8', 'test 123', 'rk', 'q', 'ex'],
      ['', '2', '67', 'rk', 'q', 'ex'],
    ])
    expect(result.errors).toEqual([])
    expect(result.rows.map((r) => r.payloadEncoding)).toEqual([
      'string',
      'string',
      'string',
      'string',
    ])
  })

  it('classifies as base64 when size matches the decoded length', () => {
    // 'SGVsbG8gd29ybGQ=' -> 'Hello world' (11 bytes)
    const result = validateAndMapRows([
      ['', '11', 'SGVsbG8gd29ybGQ=', 'rk', 'q', 'ex'],
    ])
    expect(result.rows[0].payloadEncoding).toBe('base64')
  })

  it('falls back to the syntactic heuristic when size is missing or unparseable', () => {
    const result = validateAndMapRows([
      ['', '', 'SGVsbG8gd29ybGQ=', 'rk', 'q', 'ex'],
      ['', 'not-a-number', 'plain', 'rk', 'q', 'ex'],
    ])
    expect(result.rows[0].payloadEncoding).toBe('base64')
    expect(result.rows[1].payloadEncoding).toBe('string')
  })

  it('respects multibyte UTF-8 byte length when comparing to size', () => {
    // 'café' = 5 UTF-8 bytes (c, a, f, é=2 bytes)
    const result = validateAndMapRows([
      ['', '5', 'café', 'rk', 'q', 'ex'],
    ])
    expect(result.rows[0].payloadEncoding).toBe('string')
  })

  it('records an error when a row has the wrong number of columns', () => {
    const result = validateAndMapRows([
      ['msg-1', '5', 'hello'],
      ['msg-2', '5', 'world', 'rk', 'q', 'ex'],
    ])
    expect(result.errors).toEqual([
      { line: 1, reason: `expected ${EXPECTED_COLUMNS.length} columns, got 3` },
    ])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].id).toBe('msg-2')
  })

  it('returns empty result for empty input', () => {
    expect(validateAndMapRows([])).toEqual({ rows: [], errors: [], hasHeader: false })
  })
})
