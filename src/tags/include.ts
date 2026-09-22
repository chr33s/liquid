import type { OperationOptions } from '../util/operation'
import {
  Template,
  ValueToken,
  TopLevelToken,
  Liquid,
  Tag,
  assert,
  evalToken,
  Hash,
  Emitter,
  TagToken,
  Context
} from '..'
import { Scope } from '../context'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'
import { isArray, isString, isValueToken } from '../util'
import { basename, bindingOf, parseFilePath, renderFilePath, ParsedFileName, toFilePath } from './render'
import type { ParsedMarkup } from '../parser/strict2'

export default class extends Tag {
  private file: ParsedFileName
  private currentFile?: string
  private withVar?: ValueToken
  private alias?: string
  private hash: Hash
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const { tokenizer } = token
    this.currentFile = token.file
    const parsed = token.parsed as ParsedMarkup<'include'> | undefined
    if (parsed) {
      this.file = toFilePath(parsed.file, parser)
      this.withVar = bindingOf(parsed.binding?.value)
      this.alias = parsed.alias?.content
      this.hash = new Hash(parsed.hash)
      return
    }
    this.file = parseFilePath(tokenizer, this.liquid, parser)

    const begin = tokenizer.p
    const keyword = tokenizer.readIdentifier()
    if (keyword.content === 'with' || keyword.content === 'for') {
      tokenizer.skipBlank()
      if (tokenizer.peek() !== ':') {
        this.withVar = bindingOf(tokenizer.readValue())
        const beforeAs = tokenizer.p
        const asStr = tokenizer.readIdentifier()
        if (asStr.content === 'as') this.alias = tokenizer.readIdentifier().content
        else tokenizer.p = beforeAs
      } else tokenizer.p = begin
    } else tokenizer.p = begin

    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    assert(
      !(ctx.getRegister<string[]>('disabledTags', []) as string[]).includes('include'),
      'include usage is not allowed in this context'
    )
    const { liquid, hash, withVar } = this
    const { renderer } = liquid
    const filepath = (yield renderFilePath(this.file, ctx, liquid)) as string
    assert(isString(filepath), "Argument error in tag 'include' - Illegal template name")
    ctx.depthLimit.use(1)

    try {
      const templates = (yield liquid._parsePartialFile(
        filepath,

        this.currentFile,
        ctx.operationOptions
      )) as Template[]
      const bound = this.alias ?? basename(filepath)
      // without `with`/`for`, the variable named like the template is bound
      const value = withVar ? yield evalToken(withVar, ctx) : yield ctx._get([filepath], false)
      // the bindings belong to the scope this tag pushes, so that popping it
      // takes them with it rather than leaving them in the root scope
      const included: Scope = ctx.push({})
      try {
        for (const [key, token] of Object.entries(hash.hash)) {
          included[key] = token === undefined ? true : yield evalToken(token, ctx)
        }
        if (isArray(value)) {
          for (const item of value) {
            included[bound] = item
            yield renderer.renderTemplates(templates, ctx, emitter)
          }
        } else {
          included[bound] = value
          yield renderer.renderTemplates(templates, ctx, emitter)
        }
      } finally {
        ctx.pop()
      }
    } finally {
      ctx.depthLimit.release(1)
    }
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    if (Array.isArray(this.file)) return this.file
    if (partials && isString(this.file)) {
      return (yield this.liquid._parsePartialFile(this.file, this.currentFile, options)) as Template[]
    }
    return []
  }

  public partialScope(): PartialScope | undefined {
    if (isString(this.file)) {
      const names: Array<string | [string, Argument]> = Object.keys(this.hash.hash)
      if (this.withVar) {
        names.push([this.alias ?? basename(this.file), this.withVar])
      }

      return { name: this.file, isolated: false, scope: names }
    }
  }

  public *arguments(): Arguments {
    yield* Object.values(this.hash.hash).filter(isValueToken)

    if (isValueToken(this.file)) {
      yield this.file
    }

    if (isValueToken(this.withVar)) {
      yield this.withVar
    }
  }
}
