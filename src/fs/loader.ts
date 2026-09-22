import { FS, FileReadOptions, isMissing } from './fs'
import type { OperationOptions } from '../util/operation'
import { assert } from '../util'

export interface LoaderOptions {
  fs: FS
  extname: string
  root: string[]
  partials: string[]
  layouts: string[]
  relativeReference: boolean
}
export enum LookupType {
  Partials = 'partials',
  Layouts = 'layouts',
  Root = 'root'
}
export class Loader {
  public shouldLoadRelative: (referencedFile: string) => boolean
  private options: LoaderOptions

  constructor(options: LoaderOptions) {
    this.options = options
    if (options.relativeReference) {
      const sep = options.fs.sep
      assert(sep, '`fs.sep` is required for relative reference')
      const prefixes = ['.' + sep, '..' + sep, './', '../']
      this.shouldLoadRelative = (referencedFile: string) => prefixes.some(prefix => referencedFile.startsWith(prefix))
    } else {
      this.shouldLoadRelative = (_referencedFile: string) => false
    }
  }

  private *allowed(filepath: string, dirs: string[], options: OperationOptions): Generator<unknown, boolean, boolean> {
    const fs = this.options.fs
    for (const dir of dirs) {
      options.signal?.throwIfAborted()
      if (!fs.contains || (yield fs.contains(dir, filepath, options))) return true
    }
    return false
  }

  public *lookup(
    file: string,
    type: LookupType,
    currentFile?: string,
    options: OperationOptions = {}
  ): Generator<unknown, string, boolean> {
    const dirs = this.options[type]
    for (const filepath of this.candidates(file, dirs, currentFile)) {
      if (!(yield this.allowed(filepath, dirs, options))) continue
      options.signal?.throwIfAborted()
      if (yield this.options.fs.exists(filepath, options)) return filepath
    }
    throw this.lookupError(file, dirs)
  }

  public *load(
    file: string,
    type: LookupType,
    currentFile?: string,
    options: FileReadOptions = {}
  ): Generator<unknown, { filepath: string; source: string }, any> {
    const dirs = this.options[type]
    const fs = this.options.fs
    let missing: unknown
    for (const filepath of this.candidates(file, dirs, currentFile)) {
      try {
        if (!(yield this.allowed(filepath, dirs, options))) continue
        options.signal?.throwIfAborted()
        if (!(yield fs.exists(filepath, options))) continue
        options.signal?.throwIfAborted()
        const source = yield fs.readFile(filepath, options)
        options.signal?.throwIfAborted()
        if (source.length > (options.sourceCodeUnitLimit ?? Infinity)) throw new Error('parse length limit exceeded')
        return { filepath, source }
      } catch (error) {
        options.signal?.throwIfAborted()
        if (!isMissing(error)) throw error
        missing = error
      }
    }
    throw missing ?? this.lookupError(file, dirs)
  }

  public *candidates(file: string, dirs: string[], currentFile?: string) {
    const { fs, extname } = this.options

    if (this.shouldLoadRelative(file) && currentFile) {
      const referenced = fs.resolve(this.dirname(currentFile), file, extname)
      yield referenced
    }
    for (const dir of dirs) {
      const referenced = fs.resolve(dir, file, extname)
      yield referenced
    }

    if (fs.fallback !== undefined) {
      const filepath = fs.fallback(file)
      if (filepath !== undefined) yield filepath
    }
  }

  private dirname(path: string) {
    const fs = this.options.fs
    assert(fs.dirname, '`fs.dirname` is required for relative reference')
    return fs.dirname!(path)
  }

  private lookupError(file: string, roots: string[]) {
    const err = new Error('ENOENT') as any
    err.message = `ENOENT: Failed to lookup "${file}" in "${roots}"`
    err.code = 'ENOENT'
    return err
  }
}
