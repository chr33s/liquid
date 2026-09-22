import { isNil, stringify, toValue } from '../util/underscore'

export function url_decode(x: string) {
  const chars = [...stringify(x).replace(/\+/g, ' ')]
  const bytes: number[] = []
  const encoder = new TextEncoder()
  for (let i = 0; i < chars.length; i++) {
    const hex = chars[i] === '%' ? chars.slice(i + 1, i + 3).join('') : undefined
    if (hex !== undefined && /^[0-9a-fA-F]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      // a malformed escape is left as written, as the reference does
      for (const byte of encoder.encode(chars[i])) bytes.push(byte)
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    throw new Error('invalid byte sequence')
  }
}

// CGI-style escaping: unlike encodeURIComponent, `!'()*` are escaped too
export const url_encode = (x: string) =>
  isNil(toValue(x))
    ? x
    : encodeURIComponent(stringify(x))
        .replace(/%20/g, '+')
        .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
