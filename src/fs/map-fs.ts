import type { FileReadOptions } from './fs'
import { isNil } from '../util'

export class MapFS {
  constructor(private mapping: { [key: string]: string }) {}

  public sep = '/'

  async exists(filepath: string) {
    return !isNil(this.mapping[filepath])
  }

  async readFile(filepath: string, options: FileReadOptions = {}) {
    options.signal?.throwIfAborted()
    const content = this.mapping[filepath]
    if (isNil(content)) throw Object.assign(new Error(`ENOENT: ${filepath}`), { code: 'ENOENT' })
    if (content.length > (options.sourceCodeUnitLimit ?? Infinity)) throw new Error('parse length limit exceeded')
    let bytes = 0
    for (const character of content) {
      const code = character.codePointAt(0)!
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
      if (bytes > (options.sourceByteLimit ?? Infinity)) throw new Error('source byte limit exceeded')
    }
    return content
  }

  dirname(filepath: string) {
    const segments = filepath.split(this.sep)
    segments.pop()
    return segments.join(this.sep)
  }

  resolve(dir: string, file: string, ext: string) {
    file += ext
    if (dir === '.') return file
    const segments = dir.split(/\/+/)
    for (const segment of file.split(this.sep)) {
      if (segment === '.' || segment === '') continue
      else if (segment === '..') {
        if (segments.length > 1 || segments[0] !== '') segments.pop()
      } else segments.push(segment)
    }
    return segments.join(this.sep)
  }
}
