/**
 * Base64 related filters
 *
 * Implements base64_encode and base64_decode filters for Shopify compatibility
 */

import { FilterImpl } from '../template'
import { stringify } from '../util'
import { base64Encode, base64Decode, base64UrlSafeEncode, base64UrlSafeDecode } from './base64-impl'

export function base64_encode(this: FilterImpl, value: string | Buffer): string {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.toString('base64')
  }
  const str = stringify(value)
  return base64Encode(str)
}

export function base64_decode(this: FilterImpl, value: string): string {
  return base64Decode(stringify(value))
}

export function base64_url_safe_encode(this: FilterImpl, value: string | Buffer): string {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.toString('base64url')
  }
  return base64UrlSafeEncode(stringify(value))
}

export function base64_url_safe_decode(this: FilterImpl, value: string): string {
  return base64UrlSafeDecode(stringify(value))
}
