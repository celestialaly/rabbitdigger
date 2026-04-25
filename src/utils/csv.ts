/**
 * Minimal RFC 4180 CSV serializer.
 *
 * - Each field is quoted with `quote` only when it contains the `separator`,
 *   the `quote` itself, CR or LF.
 * - Embedded `quote` characters are escaped by doubling them.
 * - Records are joined with CRLF.
 */
export interface ToCsvOptions {
  separator: string
  quote: string
  /** When provided, written as the first record. */
  header?: readonly string[]
}

export function toCsv(rows: readonly (readonly string[])[], opts: ToCsvOptions): string {
  const { separator, quote, header } = opts

  if (typeof separator !== 'string' || separator.length !== 1) {
    throw new Error('toCsv: `separator` must be a single character')
  }
  if (typeof quote !== 'string' || quote.length !== 1) {
    throw new Error('toCsv: `quote` must be a single character')
  }
  if (separator === quote) {
    throw new Error('toCsv: `separator` and `quote` must be different')
  }

  const records: string[] = []
  if (header) records.push(encodeRecord(header, separator, quote))
  for (const row of rows) records.push(encodeRecord(row, separator, quote))
  return records.join('\r\n')
}

function encodeRecord(row: readonly string[], separator: string, quote: string): string {
  return row.map((field) => encodeField(field, separator, quote)).join(separator)
}

function encodeField(field: string, separator: string, quote: string): string {
  const needsQuoting =
    field.includes(separator) ||
    field.includes(quote) ||
    field.includes('\n') ||
    field.includes('\r')
  if (!needsQuoting) return field
  const escaped = field.split(quote).join(quote + quote)
  return quote + escaped + quote
}
