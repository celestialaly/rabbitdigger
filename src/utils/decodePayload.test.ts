import { describe, it, expect } from 'vitest'
import { decodePayload } from './decodePayload'

describe('decodePayload', () => {
  it('returns the input as-is for "string" encoding', () => {
    const r = decodePayload('hello world', 'string')
    expect(r.text).toBe('hello world')
    expect(r.binary).toBe(false)
  })

  it('decodes base64 ASCII to text', () => {
    const r = decodePayload(btoa('hello'), 'base64')
    expect(r.text).toBe('hello')
    expect(r.binary).toBe(false)
  })

  it('decodes base64 UTF-8 multi-byte sequences', () => {
    // "café" — UTF-8 bytes 63 61 66 c3 a9
    const r = decodePayload(btoa('caf\u00c3\u00a9'), 'base64')
    expect(r.text).toBe('café')
    expect(r.binary).toBe(false)
  })

  it('flags binary when base64 decodes to invalid UTF-8 (PNG header)', () => {
    // PNG magic: 89 50 4e 47 0d 0a 1a 0a
    const pngHeader = String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    const b64 = btoa(pngHeader)
    const r = decodePayload(b64, 'base64')
    expect(r.binary).toBe(true)
    expect(r.text).toBe(b64)
  })
})
