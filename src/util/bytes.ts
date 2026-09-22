/**
 * Byte strings as the reference keeps them: a byte that is not part of valid
 * UTF-8 is held as the lone surrogate U+DC80–U+DCFF, so decoded binary data
 * survives string operations and encodes back to the same bytes.
 */
const ESCAPE = 0xdc00

export function fromBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    let output = ''
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i]
      const n = b < 0x80 ? 1 : b < 0xc2 ? 0 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : b < 0xf5 ? 4 : 0
      const cp = n ? codePointAt(bytes, i, n) : undefined
      if (cp === undefined) {
        output += String.fromCharCode(ESCAPE + b)
        i++
      } else {
        output += String.fromCodePoint(cp)
        i += n
      }
    }
    return output
  }
}

export function toBytes(str: string): Uint8Array<ArrayBuffer> {
  if (!/[\udc80-\udcff]/.test(str)) return new TextEncoder().encode(str)
  const bytes: number[] = []
  for (const char of str) {
    const code = char.charCodeAt(0)
    if (char.length === 1 && code >= ESCAPE + 0x80 && code <= ESCAPE + 0xff) bytes.push(code - ESCAPE)
    else bytes.push(...new TextEncoder().encode(char))
  }
  return Uint8Array.from(bytes)
}

function codePointAt(bytes: Uint8Array, i: number, n: number): number | undefined {
  if (n === 1) return bytes[i]
  if (i + n > bytes.length) return
  let cp = bytes[i] & (0xff >> (n + 1))
  for (let k = 1; k < n; k++) {
    const c = bytes[i + k]
    if ((c & 0xc0) !== 0x80) return
    cp = (cp << 6) | (c & 0x3f)
  }
  const min = [0, 0, 0x80, 0x800, 0x10000][n]
  if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return
  return cp
}
