import { blake3 as blake3Bytes } from '../filters/hosted/blake3'
import { toBytes } from '../util/bytes'
import { md5 as md5Bytes } from '../filters/hosted/md5'

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

export async function sha256(str: string): Promise<string> {
  return digest('SHA-256', str)
}

export async function sha1(str: string): Promise<string> {
  return digest('SHA-1', str)
}

export function md5(str: string): string {
  return bufferToHex(md5Bytes(toBytes(str)))
}

export function blake3(str: string): string {
  return bufferToHex(blake3Bytes(toBytes(str)))
}

export async function hmacSha256(str: string, key: string): Promise<string> {
  return hmac('SHA-256', str, key)
}

export async function hmacSha1(str: string, key: string): Promise<string> {
  return hmac('SHA-1', str, key)
}

async function digest(algorithm: string, str: string): Promise<string> {
  const data = toBytes(str)
  return bufferToHex(await crypto.subtle.digest(algorithm, data))
}

async function hmac(hash: string, str: string, key: string): Promise<string> {
  const keyBytes = key ? toBytes(key) : new Uint8Array(64)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash }, false, ['sign'])
  return bufferToHex(await crypto.subtle.sign('HMAC', cryptoKey, toBytes(str)))
}

export { bufferToHex as toHex }
