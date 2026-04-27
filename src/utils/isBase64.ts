/**
 * Regex matching a syntactically valid base64-encoded string (RFC 4648
 * standard alphabet). Enforces:
 *  - length multiple of 4 (groups of 4 valid chars, plus an optional final
 *    group of 2 chars + `==` or 3 chars + `=`);
 *  - alphabet limited to `0-9`, `a-z`, `A-Z`, `+`, `/`;
 *  - padding (`=`) only at the very end.
 */
export const BASE64_REGEX =
  /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/

/**
 * Heuristic: does `s` look like a base64-encoded string?
 *
 * The empty string returns `false` (the regex would otherwise match it,
 * but an empty payload is never meaningful base64 in our use cases).
 */
export function isBase64(s: string): boolean {
  if (s.length === 0) return false
  return BASE64_REGEX.test(s)
}
