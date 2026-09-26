import { Operation, type OperationOptions } from '../util/operation'
import { Limiter, drive, isTagToken, isOutputToken, ParseError } from '../util'
import { Tokenizer } from './tokenizer'
import { ParseStream } from './parse-stream'
import { TopLevelToken, OutputToken } from '../tokens'
import { Template, Output, HTML } from '../template'
import { LiquidCache } from '../cache'
import { Loader, LookupType } from '../fs'
import { LiquidError, LiquidErrors } from '../util/error'
import type { Liquid } from '../liquid'

export class Parser {
  private liquid: Liquid
  private cache?: LiquidCache
  private loader: Loader
  private parseLimit: Limiter

  public constructor(liquid: Liquid) {
    this.liquid = liquid
    this.cache = this.liquid.options.cache
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
        if (!TagClass) throw new ParseError(new Error(`tag "${token.name}" not found`), token)
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
    return new ParseStream(tokens, (token, remain) => this.parseToken(token, remain))
  }

  public *parseFile(
    file: string,
    type: LookupType = LookupType.Root,
    currentFile?: string,
    options: OperationOptions = {}
  ): Generator<unknown, Template[], Template[]> {
    if (!this.cache) return yield* this.read(file, type, currentFile, options)
    const key = this.cacheKey(file, type, currentFile)
    const pending = this.liquid.pendingLoads.get(key)
    if (pending) return yield pending
    const task = this.fill(key, file, type, currentFile)
    this.liquid.pendingLoads.set(key, task)
    const clear = () => {
      if (this.liquid.pendingLoads.get(key) === task) this.liquid.pendingLoads.delete(key)
    }
    task.then(clear, clear)
    return yield task
  }

  private cacheKey(file: string, type: LookupType, currentFile?: string) {
    return this.loader.shouldLoadRelative(file) ? JSON.stringify([type, currentFile, file]) : type + ':' + file
  }

  private fill(key: string, file: string, type: LookupType, currentFile?: string): Promise<Template[]> {
    const owner = new Operation()
    const cache = this.cache!
    const run = async () => {
      let loading: Promise<Template[]> | undefined
      try {
        const cached = await cache.read(key)
        if (cached) return cached
        const readOptions = {
          signal: owner.signal,
          sourceByteLimit: this.liquid.options.sourceByteLimit,
          sourceCodeUnitLimit: this.parseLimit.remaining
        }
        loading = drive(this.read(file, type, currentFile, readOptions), owner)
        loading.catch(() => {})
        await cache.write(key, loading)
        const templates = await loading
        await cache.write(key, templates)
        return templates
      } catch (error) {
        owner.abort(error)
        if (loading) await loading.catch(() => {})
        try {
          await cache.remove(key)
        } catch {}
        throw error
      } finally {
        await owner.drain()
        owner.finish()
      }
    }
    return run()
  }

  private *read(
    file: string,
    type: LookupType,
    currentFile: string | undefined,
    options: OperationOptions & { sourceByteLimit?: number; sourceCodeUnitLimit?: number }
  ): Generator<unknown, Template[], unknown> {
    const readOptions = {
      ...options,
      sourceByteLimit: options.sourceByteLimit ?? this.liquid.options.sourceByteLimit,
      sourceCodeUnitLimit: options.sourceCodeUnitLimit ?? this.parseLimit.remaining
    }
    const loaded = (yield this.loader.load(file, type, currentFile, readOptions)) as {
      filepath: string
      source: string
    }
    return this.parse(loaded.source, loaded.filepath)
  }
}
