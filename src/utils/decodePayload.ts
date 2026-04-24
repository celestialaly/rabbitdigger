export interface DecodedPayload {
  /** Decoded UTF-8 text, or the raw base64 string if not decodable. */
  text: string
  /** True when the payload is base64-encoded and not decodable as UTF-8. */
  binary: boolean
}

/**
 * Decode a payload returned by RabbitMQ Management /get.
 *
 * RabbitMQ returns either:
 *  - encoding === 'string' → UTF-8 text already
 *  - encoding === 'base64' → binary or non-UTF-8 text, base64-encoded
 *
 * For base64 payloads we attempt a strict UTF-8 decode; if it fails we keep the
 * raw base64 string and flag the payload as binary so the UI can warn.
 */
export function decodePayload(
  payload: string,
  encoding: 'string' | 'base64',
): DecodedPayload {
  if (encoding === 'string') {
    return { text: payload, binary: false }
  }

  try {
    const binaryString = atob(payload)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text, binary: false }
  } catch {
    return { text: payload, binary: true }
  }
}
