import * as implementation from './fs-impl'
import { sep, resolve as nodeResolve, extname, dirname } from 'path'
import { stat, readFile as nodeReadFile, realpath, open } from 'fs/promises'
import { requireResolve } from './node-require'
import { isMissing, type FileReadOptions, type FS } from './fs'
import type { OperationOptions } from '../util/operation'
import { SourceReader } from './source'

export async function exists(filepath: string, options: OperationOptions = {}) {
  options.signal?.throwIfAborted()
  try {
    await stat(filepath)
    options.signal?.throwIfAborted()
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}
export async function readFile(filepath: string, options: FileReadOptions = {}) {
  options.signal?.throwIfAborted()
  if (!Number.isFinite(options.sourceByteLimit) && !Number.isFinite(options.sourceCodeUnitLimit)) {
    return nodeReadFile(filepath, { encoding: 'utf8', signal: options.signal })
  }
  const handle = await open(filepath, 'r')
  try {
    const decoder = new SourceReader(options, true)
    const buffer = new Uint8Array(16_384)
    let result = ''
    while (true) {
      options.signal?.throwIfAborted()
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
      if (!bytesRead) return result + decoder.decode()
      result += decoder.decode(buffer.subarray(0, bytesRead))
    }
  } finally {
    await handle.close()
  }
}
export function resolve(root: string, file: string, ext: string) {
  if (!extname(file)) file += ext
  return nodeResolve(root, file)
}
export function fallback(file: string) {
  try {
    return requireResolve(file)
  } catch {}
}
export async function contains(root: string, file: string, options: OperationOptions = {}) {
  options.signal?.throwIfAborted()
  try {
    const realRoot = await realpath(root)
    const realFile = await realpath(file)
    options.signal?.throwIfAborted()
    return realFile.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}
export function createFS(_baseUrl?: string): FS {
  return implementation
}
export { dirname, sep }
