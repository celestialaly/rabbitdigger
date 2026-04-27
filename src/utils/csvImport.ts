/**
 * CSV import counterpart to `csv.ts` (RFC 4180 serializer).
 *
 * Pure utilities for parsing the export format produced by `QueueMessageList`
 * (see ADR 0008) and mapping rows back into objects ready to be republished.
 *
 * No Vue, no Pinia, no fetch — these helpers are framework-free so they can be
 * tested in isolation.
 */

import { isBase64 } from './isBase64'

/** Columns produced by the CSV export, in order. */
export const EXPECTED_COLUMNS = [
  'id',
  'size',
  'body',
  'routing key',
  'source queue',
  'source exchange',
] as const

/** A row mapped to the fields actually republished. Columns we ignore on
 *  import (`size`, `routing key`, `source queue`, `source exchange`) are
 *  parsed but not kept. */
export interface ImportRow {
  /** Source line number in the CSV (1-based, includes header if present). */
  line: number
  /** Original `id` column → re-injected as `properties.message_id`. Empty string
   *  means no message_id (the broker will not auto-generate one). */
  id: string
  /** Raw `body` column from the CSV. */
  body: string
  /** Auto-detected encoding for the broker:
   *  - `base64` if `body` looks like valid base64;
   *  - `string` otherwise (treated as UTF-8 by RabbitMQ). */
  payloadEncoding: 'string' | 'base64'
}

export interface ValidationError {
  /** 1-based source line number in the CSV. */
  line: number
  reason: string
}

export interface ValidationResult {
  rows: ImportRow[]
  errors: ValidationError[]
  /** True when the first record was detected as the export header and skipped. */
  hasHeader: boolean
}

export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`CSV parse error (line ${line}): ${message}`)
    this.name = 'CsvParseError'
  }
}

/**
 * Minimal RFC 4180 CSV parser.
 *
 * - Honours custom `separator` and `quote` (each must be a single character,
 *   different from each other).
 * - Quoted fields may span multiple lines and contain the separator or
 *   newlines verbatim. Embedded quotes are escaped by doubling.
 * - Record terminators: `\r\n`, `\n`, or `\r`.
 * - A trailing empty line is ignored. A truly empty input yields `[]`.
 *
 * Throws `CsvParseError` on unterminated quotes or stray characters after a
 * closing quote.
 */
export function parseCsv(
  text: string,
  opts: { separator: string; quote: string },
): string[][] {
  const { separator, quote } = opts
  if (typeof separator !== 'string' || separator.length !== 1) {
    throw new Error('parseCsv: `separator` must be a single character')
  }
  if (typeof quote !== 'string' || quote.length !== 1) {
    throw new Error('parseCsv: `quote` must be a single character')
  }
  if (separator === quote) {
    throw new Error('parseCsv: `separator` and `quote` must be different')
  }

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let line = 1
  let recordStartLine = 1
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === quote) {
        // Doubled quote => literal quote.
        if (text[i + 1] === quote) {
          field += quote
          i += 2
          continue
        }
        // Closing quote.
        inQuotes = false
        i += 1
        // Anything other than separator / newline / EOF after a closing
        // quote is a malformed record.
        const next = text[i]
        if (next !== undefined && next !== separator && next !== '\n' && next !== '\r') {
          throw new CsvParseError(
            `unexpected character ${JSON.stringify(next)} after closing quote`,
            line,
          )
        }
        continue
      }
      if (ch === '\n') line += 1
      else if (ch === '\r' && text[i + 1] !== '\n') line += 1
      field += ch
      i += 1
      continue
    }

    if (ch === quote) {
      if (field.length !== 0) {
        throw new CsvParseError('quote must start at the beginning of a field', line)
      }
      inQuotes = true
      i += 1
      continue
    }

    if (ch === separator) {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (ch === '\r' || ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      // Consume \r\n as one terminator.
      if (ch === '\r' && text[i + 1] === '\n') i += 2
      else i += 1
      line += 1
      recordStartLine = line
      continue
    }

    field += ch
    i += 1
  }

  if (inQuotes) {
    throw new CsvParseError('unterminated quoted field', recordStartLine)
  }

  // Flush the last field/record only if there is pending content. This
  // intentionally drops a single trailing newline, matching RFC 4180.
  if (field.length !== 0 || row.length !== 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const UTF8_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null

function utf8ByteLength(s: string): number {
  if (UTF8_ENCODER) return UTF8_ENCODER.encode(s).length
  // Fallback for environments without TextEncoder (should not happen in our
  // browser/happy-dom targets, kept for safety).
  let bytes = 0
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4
      i += 1
    } else bytes += 3
  }
  return bytes
}

/**
 * Decide whether `body` should be republished as `string` or `base64`.
 *
 * Strategy (in order):
 * 1. **Use the `size` column when it is a valid non-negative integer.** This
 *    is the strongest signal: `size` is `payload_bytes` from the broker, so
 *    matching it disambiguates the (very common) case of a short ASCII body
 *    that happens to look like valid base64 (e.g. "test", "4567").
 *    - If the UTF-8 byte length of `body` equals `size`, treat as `string`.
 *    - Else if `body` parses as base64 and its decoded length equals `size`,
 *      treat as `base64`.
 *    - Otherwise (mismatch on both sides), fall back to the syntactic
 *      heuristic so the user still gets a reasonable guess.
 * 2. When `size` is missing or unparseable, use `isBase64` alone.
 */
export function detectEncoding(body: string, size: string | undefined): 'string' | 'base64' {
  if (body.length === 0) return 'string'

  if (size !== undefined && /^\d+$/.test(size.trim())) {
    const expected = Number.parseInt(size.trim(), 10)
    if (utf8ByteLength(body) === expected) return 'string'
    if (isBase64(body)) {
      try {
        if (atob(body).length === expected) return 'base64'
      } catch {
        // fall through
      }
    }
    // Size disagrees with both encodings: trust the syntactic heuristic.
    return isBase64(body) ? 'base64' : 'string'
  }

  return isBase64(body) ? 'base64' : 'string'
}

/**
 * True if `firstRow` is the export header (case-sensitive, after trim,
 * exact length and order match). Used to decide whether to skip the row
 * during validation.
 */
export function detectHeader(firstRow: readonly string[] | undefined): boolean {
  if (!firstRow || firstRow.length !== EXPECTED_COLUMNS.length) return false
  for (let i = 0; i < EXPECTED_COLUMNS.length; i += 1) {
    if (firstRow[i].trim() !== EXPECTED_COLUMNS[i]) return false
  }
  return true
}

/**
 * Validate the parsed CSV and map it to `ImportRow[]`.
 *
 * Rules:
 * - The first record is dropped if it matches `EXPECTED_COLUMNS` exactly.
 * - Every remaining record must have exactly `EXPECTED_COLUMNS.length` fields;
 *   any deviation is an error and that row is skipped.
 * - `body` may be empty (publishing an empty AMQP message is valid).
 * - `size` is read to disambiguate the payload encoding (see
 *   `detectEncoding`); if missing or unparseable, falls back to a syntactic
 *   base64 heuristic.
 * - `payloadEncoding` is auto-detected via `detectEncoding`.
 */
export function validateAndMapRows(parsed: readonly (readonly string[])[]): ValidationResult {
  const errors: ValidationError[] = []
  const rows: ImportRow[] = []

  if (parsed.length === 0) {
    return { rows, errors, hasHeader: false }
  }

  const hasHeader = detectHeader(parsed[0])
  const startIdx = hasHeader ? 1 : 0

  for (let i = startIdx; i < parsed.length; i += 1) {
    const record = parsed[i]
    const sourceLine = i + 1 // 1-based
    if (record.length !== EXPECTED_COLUMNS.length) {
      errors.push({
        line: sourceLine,
        reason: `expected ${EXPECTED_COLUMNS.length} columns, got ${record.length}`,
      })
      continue
    }
    const id = record[0]
    const size = record[1]
    const body = record[2]
    rows.push({
      line: sourceLine,
      id,
      body,
      payloadEncoding: detectEncoding(body, size),
    })
  }

  return { rows, errors, hasHeader }
}
