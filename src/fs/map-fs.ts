import type { FileReadOptions } from './fs'
import { hasOwnProperty, isNil } from '../util'
import { LiquidLimitError, LiquidLookupError } from '../util/error'

export class MapFS {
  constructor(private mapping: { [key: string]: string }) {}

  public sep = '/'

  async exists(filepath: string) {
    return !isNil(this.read(filepath))
  }

  async readFile(filepath: string, options: FileReadOptions = {}) {
    options.signal?.throwIfAborted()
    const content = this.read(filepath)
    if (content == null) throw new LiquidLookupError(`ENOENT: ${filepath}`)
    if (content.length > (options.sourceCodeUnitLimit ?? Infinity)) {
      throw new LiquidLimitError('parse length limit exceeded')
    }
    let bytes = 0
    for (const character of content) {
      const code = character.codePointAt(0)!
      bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
      if (bytes > (options.sourceByteLimit ?? Infinity)) throw new LiquidLimitError('source byte limit exceeded')
    }
    return content
  }

  private read(filepath: string): string | undefined {
    return hasOwnProperty.call(this.mapping, filepath) ? this.mapping[filepath] : undefined
  }

  dirname(filepath: string) {
    const segments = filepath.split(this.sep)
    segments.pop()
    return segments.join(this.sep) || (filepath.startsWith(this.sep) ? this.sep : '')
  }

  resolve(dir: string, file: string, ext: string) {
    const basename = file.split(this.sep).pop()!
    if (basename !== '..' && basename.lastIndexOf('.') <= 0) file += ext
    let segments: string[]
    if (file.startsWith(this.sep)) segments = ['']
    else if (dir === '.' || !dir) segments = []
    else segments = dir.split(/\/+/).filter((segment, index) => segment || index === 0)
    for (const segment of file.split(this.sep)) {
      if (segment === '.' || segment === '') continue
      else if (segment === '..') {
        if (segments.length > 1 || segments[0] !== '') segments.pop()
      } else segments.push(segment)
    }
    return segments.join(this.sep)
  }
}
