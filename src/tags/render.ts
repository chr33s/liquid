import type { OperationOptions } from '../util/operation'
import { ForloopDrop } from '../drop'
import { isIterable, isNil, isPlainObject, isString, isValueToken, literalValues, toEnumerable, toValue } from '../util'
import {
  TopLevelToken,
  Liquid,
  Token,
  ValueToken,
  Template,
  evalQuotedToken,
  TypeGuards,
  Tokenizer,
  evalToken,
  Hash,
  Emitter,
  TagToken,
  Context,
  Tag
} from '..'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'
import { fail, type ParsedMarkup } from '../parser/strict2'
import { isHosted, requireProvider } from '../theme'

export type ParsedFileName = Template[] | Token | string | undefined

type RenderBinding = { value: ValueToken; alias?: string }

export default class extends Tag {
  private file: string
  private currentFile?: string
  private hash: Hash
  private with?: RenderBinding
  private forBinding?: RenderBinding
  /** The hosted `{% render block %}`: the app block to render. */
  private appBlock?: ValueToken
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokenizer = this.tokenizer
    this.currentFile = token.file
    const parsed = token.parsed as ParsedMarkup<'render'> | undefined
    if (parsed) {
      if (!TypeGuards.isQuotedToken(parsed.file)) {
        this.appBlock = parsed.file
        this.file = ''
      } else this.file = evalQuotedToken(parsed.file)
      const binding = bindingOf(parsed.binding?.value) && parsed.binding
      if (binding)
        this[binding.keyword === 'with' ? 'with' : 'forBinding'] = {
          value: binding.value,
          alias: parsed.alias?.content
        }
      this.hash = new Hash(parsed.hash)
      return
    }
    const begin = tokenizer.p
    const name = tokenizer.readValue()
    if (isHosted(liquid.options.profile) && name?.getText() === 'block' && TypeGuards.isPropertyAccessToken(name)) {
      this.appBlock = name
      this.file = ''
      this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
      return
    }
    tokenizer.p = begin
    this.file = parseLiteralFilePath(tokenizer)
    while (!tokenizer.end()) {
      tokenizer.skipBlank()
      const begin = tokenizer.p
      const keyword = tokenizer.readIdentifier()
      if (keyword.content === 'with' || keyword.content === 'for') {
        tokenizer.skipBlank()
        // can be normal key/value pair, like "with: true"
        if (tokenizer.peek() !== ':') {
          const read = tokenizer.readValue()
          const value = bindingOf(read)
          // can be normal key, like "with,"
          if (read) {
            const beforeAs = tokenizer.p
            const asStr = tokenizer.readIdentifier()
            let alias
            if (asStr.content === 'as') alias = tokenizer.readIdentifier()
            else tokenizer.p = beforeAs

            if (value) {
              const binding: RenderBinding = { value, alias: alias && alias.content }
              if (keyword.content === 'with') this.with = binding
              else this.forBinding = binding
            }
            tokenizer.skipBlank()
            if (tokenizer.peek() === ',') tokenizer.advance()
            continue // matched!
          }
        }
      }
      /**
       * restore cursor if with/for not matched
       */
      tokenizer.p = begin
      break
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    if (this.appBlock) {
      const block = toValue(yield evalToken(this.appBlock, ctx))
      const render = requireProvider(
        ctx.theme.appBlock,
        'render.app_block',
        'no app block renderer was provided',
        ctx.capabilities
      )
      yield emitter.write(yield render.call(ctx.theme, block))
      return
    }
    ctx.depthLimit.use(1)
    try {
      yield* this.renderPartial(ctx, emitter)
    } finally {
      ctx.depthLimit.release(1)
    }
  }
  private *renderPartial(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const { liquid, hash, file: filepath } = this
    const defaultName = basename(filepath)
    const templates = (yield liquid._parsePartialFile(
      filepath,

      this.currentFile,
      ctx.operationOptions
    )) as Template[]
    const args = (yield hash.render(ctx)) as object

    const bindings: Record<string, unknown> = { ...args }
    // `for` and `with` together is an extension: `with` then binds like an argument
    if (this.forBinding && this.with) {
      bindings[this.with.alias ?? defaultName] = yield evalToken(this.with.value, ctx)
    }
    const binding = this.forBinding ?? this.with
    const name = binding ? (binding.alias ?? defaultName) : defaultName
    const value = binding ? yield evalToken(binding.value, ctx) : undefined
    // the binding is set after the arguments, and a nil one is not set at all
    const bind = (item: unknown) => (isNil(toValue(item)) ? bindings : { ...bindings, [name]: item })

    const resolved = toValue(value)
    if (this.forBinding && !isString(resolved) && (isIterable(resolved) || isPlainObject(resolved))) {
      const collection = isPlainObject(resolved) ? Object.entries(resolved) : toEnumerable(resolved)
      const forloop = new ForloopDrop(collection.length, binding!.value.getText(), name)
      for (const item of collection) {
        // a fresh child context per item: assignments, counters and registers
        // from one iteration must not be visible in the next
        const childCtx = this.spawn(ctx)
        Object.assign(childCtx.bottom(), bind(item), { forloop })
        yield liquid.renderer.renderTemplates(templates, childCtx, emitter)
        forloop.next()
      }
      return
    }

    const childCtx = this.spawn(ctx)
    Object.assign(childCtx.bottom(), bind(value))
    yield liquid.renderer.renderTemplates(templates, childCtx, emitter)
  }

  /**
   * An isolated child context in which `{% include %}` is not available,
   * matching the reference `render` contract.
   */
  private spawn(ctx: Context): Context {
    const childCtx = ctx.spawn()
    childCtx.setRegister('disabledTags', ['include'])
    return childCtx
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    if (partials && !this.appBlock) {
      return (yield this.liquid._parsePartialFile(this.file, this.currentFile, options)) as Template[]
    }
    return []
  }

  public partialScope(): PartialScope | undefined {
    if (this.appBlock) return
    const names: Array<string | [string, Argument]> = Object.keys(this.hash.hash)
    if (this.forBinding) names.push('forloop')
    const defaultName = basename(this.file)

    for (const binding of [this.with, this.forBinding]) {
      if (binding) {
        const { value, alias } = binding
        names.push([alias ?? defaultName, value])
      }
    }

    return { name: this.file, isolated: true, scope: names }
  }

  public *arguments(): Arguments {
    if (this.appBlock) yield this.appBlock
    for (const v of Object.values(this.hash.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }

    if (this.with) {
      const { value } = this.with
      if (isValueToken(value)) {
        yield value
      }
    }

    if (this.forBinding) {
      const { value } = this.forBinding
      if (isValueToken(value)) {
        yield value
      }
    }
  }
}

/** As the reference tests the expression itself, a literal `false` or `nil` is no binding at all. */
export function bindingOf(value: ValueToken | undefined): ValueToken | undefined {
  const literal = TypeGuards.isLiteralToken(value) && (value.content === false || value.content === literalValues.nil)
  return literal ? undefined : value
}

export function basename(filepath: string): string {
  return filepath.split('/').pop()!
}

/**
 * The reference `render` contract takes a quoted literal template name: it is
 * neither a variable nor an interpolated template.
 */
export function parseLiteralFilePath(tokenizer: Tokenizer): string {
  const file = tokenizer.readValue()
  tokenizer.assert(file, 'illegal file path')
  if (!TypeGuards.isQuotedToken(file)) fail("Syntax error in tag 'render' - Template name must be a quoted string")
  return evalQuotedToken(file as never)
}

/**
 * @return null for "none",
 * @return Template[] for quoted with tags and/or filters
 * @return Token for expression (not quoted)
 * @throws TypeError if cannot read next token
 */
export function parseFilePath(tokenizer: Tokenizer, liquid: Liquid, parser: Parser): ParsedFileName {
  const file = tokenizer.readValue()
  tokenizer.assert(file, 'illegal file path')
  return toFilePath(file!, parser)
}

export function toFilePath(file: ValueToken, parser: Parser): ParsedFileName {
  if (file.getText() === 'none') return
  if (TypeGuards.isQuotedToken(file)) {
    // for filenames like "files/{{file}}", eval as liquid template
    return optimize(parser.parse(evalQuotedToken(file)))
  }
  return file
}

function optimize(templates: Template[]): string | Template[] {
  // for filenames like "files/file.liquid", extract the string directly
  if (templates.length === 1 && TypeGuards.isHTMLToken(templates[0].token)) return templates[0].token.getContent()
  return templates
}

export function* renderFilePath(file: ParsedFileName, ctx: Context, liquid: Liquid): IterableIterator<unknown> {
  if (typeof file === 'string') return file
  if (Array.isArray(file)) return liquid.renderer.renderTemplates(file, ctx)
  return yield evalToken(file, ctx)
}
