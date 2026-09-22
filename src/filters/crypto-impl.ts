import { createHash, createHmac } from 'crypto'
import { blake3 as blake3Bytes } from './hosted/blake3'
import { toBytes } from '../util/bytes'

export function sha256(str: string): string {
  return createHash('sha256').update(toBytes(str)).digest('hex')
}

export function sha1(str: string): string {
  return createHash('sha1').update(toBytes(str)).digest('hex')
}

export function md5(str: string): string {
  return createHash('md5').update(toBytes(str)).digest('hex')
}

export function blake3(str: string): string {
  return toHex(blake3Bytes(toBytes(str)))
}

export function hmacSha256(str: string, key: string): string {
  return createHmac('sha256', toBytes(key)).update(toBytes(str)).digest('hex')
}

export function hmacSha1(str: string, key: string): string {
  return createHmac('sha1', toBytes(key)).update(toBytes(str)).digest('hex')
}

export function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return hex
}
