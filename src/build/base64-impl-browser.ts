import { assertBase64 } from '../filters/base64-impl'
import { fromBytes, toBytes } from '../util/bytes'

export function base64Encode(str: string): string {
  return btoa(String.fromCharCode(...toBytes(str)))
}

export function base64Decode(str: string): string {
  assertBase64(str)
  return fromBytes(Uint8Array.from(atob(str), c => c.charCodeAt(0)))
}

export function base64UrlSafeEncode(str: string): string {
  return base64Encode(str).replace(/\+/g, '-').replace(/\//g, '_')
}

export function base64UrlSafeDecode(str: string): string {
  assertBase64(str, true)
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  return fromBytes(Uint8Array.from(atob(padded), c => c.charCodeAt(0)))
}

export { assertBase64 }
