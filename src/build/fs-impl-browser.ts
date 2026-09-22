import type { FS, FileReadOptions } from '../fs/fs'
import { SourceReader } from '../fs/source'

export async function readFile(url: string, options: FileReadOptions = {}): Promise<string> {
  options.signal?.throwIfAborted()
  const response = await fetch(url, { signal: options.signal, credentials: 'same-origin' })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw Object.assign(new Error(`Template request failed with HTTP ${response.status}`), {
      status: response.status,
      code: response.status === 404 ? 'ENOENT' : 'HTTP_ERROR'
    })
  }
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new SourceReader(options)
  let complete = false
  try {
    let source = ''
    while (true) {
      options.signal?.throwIfAborted()
      const result = await reader.read()
      if (result.done) {
        complete = true
        return source + decoder.decode()
      }
      source += decoder.decode(result.value)
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

export function createFS(baseUrl?: string): FS {
  const base = baseUrl ?? (typeof document === 'undefined' ? undefined : document.baseURI)
  return {
    sep: '/',
    exists: () => true,
    readFile,
    resolve(root, file, ext) {
      let directory: URL
      try {
        directory = new URL(root || '.', base)
      } catch (error) {
        try {
          return extend(new URL(file), ext)
        } catch {}
        throw Object.assign(new Error('Relative template URL requires an absolute baseUrl'), { cause: error })
      }
      if (!directory.pathname.endsWith('/')) directory.pathname += '/'
      return extend(new URL(file, directory), ext)
    },
    dirname(file) {
      return new URL('.', file).href
    }
  }
}

function extend(result: URL, ext: string): string {
  if (!/\.\w+$/.test(result.pathname.split('/').pop()!)) result.pathname += ext
  return result.href
}
