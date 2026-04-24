/** Tiny collision-resistant ID — no external dependency needed */
export function nanoid(size = 12): string {
  return crypto.getRandomValues(new Uint8Array(size))
    .reduce((acc, byte) => acc + byte.toString(36).padStart(2, '0'), '')
    .slice(0, size)
}
