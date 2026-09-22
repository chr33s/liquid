import { Operation, associate, existingOperation, type OperationOptions } from '../util/operation'
import { Limiter, drive, assert, isTagToken, isOutputToken, ParseError } from '../util'
import { Tokenizer } from './tokenizer'
import { ParseStream } from './parse-stream'
import { markupOf, readTagMarkup, strictMarkup, Strict2SyntaxError } from './strict2'
import { laxTagMarkup } from './lax'
import { defaultOperators } from '../render/operator'
import { isHosted } from '../theme/profile'
import { TopLevelToken, OutputToken, TagToken, HTMLToken } from '../tokens'
import { Template, Output, HTML } from '../template'
import { LiquidCache } from '../cache'
import { Loader, LookupType } from '../fs'
import { LiquidError, LiquidErrors } from '../util/error'
import type { Liquid } from '../liquid'

/** Errors that already quote the markup they were raised in. */
const QUOTED = new WeakSet<Error>()

export class Parser {
  public parseFile: (
    file: string,
    type?: LookupType,
    currentFile?: string,
    options?: OperationOptions & { tenant?: string }
  ) => Generator<unknown, Template[], Template[] | string>

  private liquid: Liquid
  private cache?: LiquidCache
  private loader: Loader
  private parseLimit: Limiter
  private parseDepth = 0
  /** The tags whose bodies are being parsed, innermost last. */
  private blocks: string[] = []

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
    this.parseDepth++
    try {
      assert(this.parseDepth <= this.liquid.options.maxParseDepth, 'parse depth limit exceeded')
      if (isTagToken(token)) {
        if (token.malformed) throw token.malformed
        const TagClass = this.liquid.tags[token.name]
        assert(TagClass, () => this.unknownTag(token.name))
        if (this.strict2) this.inContext(token, () => (token.parsed = this.readMarkup(token)))
        else if (this.strict) {
          if (this.referenceSyntax) this.inContext(token, () => strictMarkup[token.name]?.(token.args))
          this.inContext(token, () => this.readLax(token))
        } else this.readLax(token)
        this.blocks.push(token.name)
        try {
          const construct = () => new TagClass(token, remainTokens, this.liquid, this)
          return this.strict ? this.inContext(token, construct) : construct()
        } finally {
          this.blocks.pop()
        }
      }
      if (isOutputToken(token)) {
        assert(
          (token as OutputToken).terminated,
          () => `Variable '${token.getText()}' was not properly terminated with regexp: /\\}\\}/`
        )
        const output = token as OutputToken
        if (this.strict && this.referenceSyntax) this.inContext(output, () => strictMarkup.output(output.content))
        return this.inContext(output, () => new Output(output, this.liquid))
      }
      return new HTML(token)
    } catch (e) {
      if (LiquidError.is(e)) throw e
      // as the reference, a block that is never closed is reported where the input ends
      const unclosed = /' tag was never closed$/.test((e as Error).message)
      throw new ParseError(
        e as Error,
        unclosed ? new HTMLToken(token.input, token.input.length, token.input.length, token.file) : token
      )
    } finally {
      this.parseDepth--
    }
  }
  public parseStream(tokens: TopLevelToken[]) {
    return new ParseStream(
      tokens,
      (token, tokens) => this.parseToken(token, tokens),
      token => this.checkBranch(token)
    )
  }
  private readMarkup(token: TagToken) {
    return readTagMarkup(token.name, markupOf(token), { hosted: isHosted(this.liquid.options.profile) })
  }
  /** As the reference's strict modes, a syntax error in a tag's or an output's markup quotes that markup; `when` does not. */
  private inContext<T>(token: TagToken | OutputToken, parse: () => T): T {
    try {
      return parse()
    } catch (e) {
      const quoted = this.strict || this.strict2
      if (
        quoted &&
        e instanceof Strict2SyntaxError &&
        !QUOTED.has(e) &&
        !(isTagToken(token) && token.name === 'when')
      ) {
        e.message += ` in "${this.markupText(token)}"`
        QUOTED.add(e)
      }
      throw e
    }
  }
  /** The markup as the reference quotes it: an output or `echo` as the variable it holds, other tags stripped. */
  private markupText(token: TagToken | OutputToken): string {
    const { input } = token
    const { outputDelimiterLeft, outputDelimiterRight, tagDelimiterRight } = this.liquid.options
    if (isOutputToken(token)) {
      let [begin, end] = [token.begin + outputDelimiterLeft.length, token.end - outputDelimiterRight.length]
      if (input[begin] === '-') begin++
      if (input[end - 1] === '-') end--
      return `{{${input.slice(begin, end)}}}`
    }
    if (token.name !== 'echo') return token.args.trim()
    // a line of `{% liquid %}` has no delimiters
    if (!((token as unknown) instanceof TagToken)) return `{{${token.args}}}`
    let end = token.end - tagDelimiterRight.length
    if (input[end - 1] === '-') end--
    return `{{${input.slice(token.argsBegin, end)}}}`
  }
  /** The reference engine's message for a tag no enclosing block or registry accepts. */
  private unknownTag(name: string): string {
    const block = this.blocks[this.blocks.length - 1]
    if (block === undefined) {
      return name === 'else' || name === 'end' ? `Unexpected outer '${name}' tag` : `Unknown tag '${name}'`
    }
    if (name === 'else') return `${block} tag does not expect 'else' tag`
    if (name.startsWith('end')) {
      const delimiter = block === 'liquid' ? '%}' : `end${block}`
      return `'${name}' is not a valid delimiter for ${block} tags. use ${delimiter}`
    }
    return `Unknown tag '${name}'`
  }
  private get strict2() {
    return this.liquid.options.errorMode === 'strict2'
  }
  private get strict() {
    return this.liquid.options.errorMode === 'strict'
  }
  /** The reference's strict grammar knows neither custom operators nor another key-value separator. */
  private get referenceSyntax() {
    const { operators, keyValueSeparator } = this.liquid.options
    return keyValueSeparator === ':' && Object.keys(operators).every(name => name in defaultOperators)
  }
  private get lax() {
    return this.liquid.options.errorMode === 'lax'
  }
  /** In lax mode, markup that does not read as written is read the way the reference's lax parser reads it. */
  private readLax(token: TagToken) {
    // the reference's strict mode keeps the lax grammar for the tags it has no strict grammar for
    // and strict `assign` names its variable as the lax grammar does
    if (!this.lax && !(this.strict && (!(token.name in strictMarkup) || token.name === 'assign'))) return
    const { operators, keyValueSeparator } = this.liquid.options
    const lax = laxTagMarkup(token.name, token.args, operators, keyValueSeparator)
    if (!lax) return
    token.rewrite(lax.markup, operators)
    token.laxCondition = lax.condition
  }
  /** The markup of a branch tag a block handles itself, like `elsif` or `when`. */
  private checkBranch(token: TopLevelToken) {
    if (!isTagToken(token) || token.name === 'else') return
    try {
      if (this.strict2) this.inContext(token, () => (token.parsed = this.readMarkup(token)))
      else {
        this.inContext(token, () => this.readLax(token))
        if (this.strict && this.referenceSyntax && token.name in strictMarkup) {
          this.inContext(token, () => strictMarkup[token.name](token.args))
        }
      }
    } catch (e) {
      // as the reference, a strict branch error is reported at the line of the block it belongs to
      if ((this.strict || this.strict2) && token.name !== 'when') throw e
      throw new ParseError(e as Error, token)
    }
  }
  private *_parseFileCached(
    file: string,
    type: LookupType = LookupType.Root,
    currentFile?: string,
    options?: OperationOptions & { tenant?: string }
  ): Generator<unknown, Template[], Template[]> {
    const cache = this.cache!
    const base = this.loader.shouldLoadRelative(file) ? JSON.stringify([type, currentFile, file]) : type + ':' + file
    const { profile, theme } = this.liquid.options
    const tenant = options?.tenant ?? theme.tenant
    const key = JSON.stringify([profile, tenant ?? '', base])
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
      this.loadCached(key, cached, file, type, currentFile, tenant).then(resolve, reject)
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
    currentFile?: string,
    tenant?: string
  ): Promise<Template[]> {
    let owner: Operation | undefined
    let task: Promise<Template[]> | undefined
    try {
      const templates = await cached
      if (templates) return templates
      owner = new Operation()
      const options = associate({ signal: owner.signal, tenant }, owner)
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
    options: OperationOptions & { tenant?: string } = {}
  ): Generator<unknown, Template[], any> {
    const readOptions = {
      ...options,
      tenant: options.tenant ?? this.liquid.options.theme.tenant,
      sourceByteLimit: this.liquid.options.sourceByteLimit,
      sourceCodeUnitLimit: this.parseLimit.remaining
    }
    const owner = existingOperation(options)
    if (owner) associate(readOptions, owner)
    const { filepath, source } = yield this.loader.load(file, type, currentFile, readOptions)
    return this.parse(source, filepath)
  }
}
