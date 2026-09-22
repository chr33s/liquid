import { Operation, associate, existingOperation, type OperationOptions } from '../util/operation'
import { Limiter, drive, assert, isTagToken, isOutputToken, ParseError } from '../util'
import { Tokenizer } from './tokenizer'
import { ParseStream } from './parse-stream'
import { TopLevelToken, OutputToken } from '../tokens'
import { Template, Output, HTML } from '../template'
import { LiquidCache } from '../cache'
import { Loader, LookupType } from '../fs'
import { LiquidError, LiquidErrors } from '../util/error'
import type { Liquid } from '../liquid'

export class Parser {
  public parseFile: (
    file: string,
    type?: LookupType,
    currentFile?: string,
    options?: OperationOptions
  ) => Generator<unknown, Template[], Template[] | string>

  private liquid: Liquid
  private cache?: LiquidCache
  private loader: Loader
  private parseLimit: Limiter

  public constructor(liquid: Liquid) {
    this.liquid = liquid
    this.cache = this.liquid.options.cache
    this.parseFile = this.cache
      ? this._parseFileCached
      : (file, type, currentFile, options) => this._parseFile(file, type, currentFile, options)
    this.loader = new Loader(this.liquid.options)
    this.parseLimit = new Limiter('parse length', liquid.options.parseLimit)
  }
  public parse(html: string, filepath?: string): Template[] {
    html = String(html)
    this.parseLimit.use(html.length)
    const tokenizer = new Tokenizer(html, this.liquid.options.operators, filepath)
    const tokens = tokenizer.readTopLevelTokens(this.liquid.options)
    return this.parseTokens(tokens)
  }
  public parseTokens(tokens: TopLevelToken[]) {
    let token
    const templates: Template[] = []
    const errors: LiquidError[] = []
    while ((token = tokens.shift())) {
      try {
        templates.push(this.parseToken(token, tokens))
      } catch (err) {
        if (this.liquid.options.catchAllErrors) errors.push(err as LiquidError)
        else throw err
      }
    }
    if (errors.length) throw new LiquidErrors(errors)
    return templates
  }
  public parseToken(token: TopLevelToken, remainTokens: TopLevelToken[]) {
    try {
      if (isTagToken(token)) {
        const TagClass = this.liquid.tags[token.name]
        assert(TagClass, `tag "${token.name}" not found`)
        return new TagClass(token, remainTokens, this.liquid, this)
      }
      if (isOutputToken(token)) {
        return new Output(token as OutputToken, this.liquid)
      }
      return new HTML(token)
    } catch (e) {
      if (LiquidError.is(e)) throw e
      throw new ParseError(e as Error, token)
    }
  }
  public parseStream(tokens: TopLevelToken[]) {
    return new ParseStream(tokens, (token, tokens) => this.parseToken(token, tokens))
  }
  private *_parseFileCached(
    file: string,
    type: LookupType = LookupType.Root,
    currentFile?: string,
    options?: OperationOptions
  ): Generator<unknown, Template[], Template[]> {
    const cache = this.cache!
    const key = this.loader.shouldLoadRelative(file) ? JSON.stringify([type, currentFile, file]) : type + ':' + file
    let task = this.liquid.pendingLoads.get(key)
    if (task) return yield task
    let resolve!: (templates: Template[] | PromiseLike<Template[]>) => void
    let reject!: (error: unknown) => void
    task = new Promise<Template[]>((yes, no) => {
      resolve = yes
      reject = no
    })
    this.liquid.pendingLoads.set(key, task)
    const owned = task
    const clear = () => {
      if (this.liquid.pendingLoads.get(key) === owned) this.liquid.pendingLoads.delete(key)
    }
    task.then(clear, clear)
    try {
      const cached = cache.read(key)
      if (Array.isArray(cached)) {
        resolve(cached)
        clear()
        return cached
      }
      this.loadCached(key, cached, file, type, currentFile).then(resolve, reject)
    } catch (error) {
      this.removeFailed(key, error).then(resolve, reject)
    }
    return yield task
  }

  private async removeFailed(key: string, error: unknown): Promise<never> {
    try {
      await this.cache!.remove(key)
    } catch {}
    throw error
  }

  private async loadCached(
    key: string,
    cached: ReturnType<LiquidCache['read']>,
    file: string,
    type: LookupType,
    currentFile?: string
  ): Promise<Template[]> {
    let owner: Operation | undefined
    let task: Promise<Template[]> | undefined
    try {
      const templates = await cached
      if (templates) return templates
      owner = new Operation()
      const options = associate({ signal: owner.signal }, owner)
      task = drive(this._parseFile(file, type, currentFile, options), owner)
      task.catch(() => {})
      await this.cache!.write(key, task)
      const parsed = await task
      await this.cache!.write(key, parsed)
      return parsed
    } catch (error) {
      owner?.abort(error)
      if (task) await task.catch(() => {})
      return await this.removeFailed(key, error)
    } finally {
      owner?.finish()
    }
  }
  private *_parseFile(
    file: string,
    type: LookupType = LookupType.Root,
    currentFile?: string,
    options: OperationOptions = {}
  ): Generator<unknown, Template[], any> {
    const readOptions = {
      ...options,
      sourceByteLimit: this.liquid.options.sourceByteLimit,
      sourceCodeUnitLimit: this.parseLimit.remaining
    }
    const owner = existingOperation(options)
    if (owner) associate(readOptions, owner)
    const { filepath, source } = yield this.loader.load(file, type, currentFile, readOptions)
    return this.parse(source, filepath)
  }
}
