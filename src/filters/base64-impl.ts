import { fromBytes, toBytes } from '../util/bytes'

export function base64Encode(str: string): string {
  return Buffer.from(toBytes(str)).toString('base64')
}

export function base64Decode(str: string): string {
  assertBase64(str)
  return fromBytes(Buffer.from(str, 'base64'))
}

export function base64UrlSafeEncode(str: string): string {
  // padded, as the reference's `Base64.urlsafe_encode64`
  return base64Encode(str).replace(/\+/g, '-').replace(/\//g, '_')
}

export function base64UrlSafeDecode(str: string): string {
  assertBase64(str, true)
  return fromBytes(Buffer.from(str, 'base64url'))
}

export function assertBase64(str: string, urlSafe = false): void {
  const pattern = urlSafe ? /^[A-Za-z0-9\-_]*={0,2}$/ : /^[A-Za-z0-9+/\r\n]*={0,2}$/
  if (!pattern.test(str) || str.replace(/[=\r\n]/g, '').length % 4 === 1) {
    throw new Error('invalid base64 provided')
  }
}
