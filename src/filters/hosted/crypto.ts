import { FilterImpl } from '../../template'
import { stringify } from '../../util'
import {
  sha1 as sha1Impl,
  sha256 as sha256Impl,
  md5 as md5Impl,
  blake3 as blake3Impl,
  hmacSha1 as hmacSha1Impl,
  hmacSha256 as hmacSha256Impl
} from '../crypto-impl'

export function sha1(this: FilterImpl, value: unknown): string | Promise<string> {
  return sha1Impl(stringify(value))
}

export function md5(this: FilterImpl, value: unknown): string | Promise<string> {
  return md5Impl(stringify(value))
}

export function blake3(this: FilterImpl, value: unknown): string | Promise<string> {
  return blake3Impl(stringify(value))
}

export function hmac_sha1(this: FilterImpl, value: unknown, key: unknown): string | Promise<string> {
  return hmacSha1Impl(stringify(value), stringify(key))
}

export function sha256(this: FilterImpl, value: unknown): string | Promise<string> {
  return sha256Impl(stringify(value))
}

export function hmac_sha256(this: FilterImpl, value: unknown, key: unknown): string | Promise<string> {
  return hmacSha256Impl(stringify(value), stringify(key))
}
