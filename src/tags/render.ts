import type { OperationOptions } from '../util/operation'
import { ForloopDrop } from '../drop'
import { isString, isValueToken, toEnumerable } from '../util'
import { Hash, Liquid, Tag, Template, Emitter, TagToken, TopLevelToken, Context, evalToken } from '..'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'
import { LookupType } from '../fs'
import { isControl } from '../render/control'
import {
  childTemplates,
  hashValues,
  parseFilePath,
  parseTemplates,
  readKeyword,
  renderFilePath,
  resolvePartial,
  withDepth,
  type KeywordBinding,
  type ParsedFileName
} from './partial'

export type { ParsedFileName }
export { parseFilePath, renderFilePath }

export default class extends Tag {
  private file: ParsedFileName
  private currentFile?: string
  private hash: Hash
  private with?: KeywordBinding
  private forBinding?: KeywordBinding

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokenizer = this.tokenizer
    this.file = parseFilePath(tokenizer, this.liquid, parser)
    this.currentFile = token.file
    while (!tokenizer.end()) {
      const withBinding = readKeyword(tokenizer, 'with', true)
      if (withBinding) {
        this.with = withBinding
        continue
      }
      const forBinding = readKeyword(tokenizer, 'for', true)
      if (forBinding) {
        this.forBinding = forBinding
        continue
      }
      break
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator)
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    yield* withDepth(ctx, this.renderPartial(ctx, emitter))
  }

  private *renderPartial(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const resolved = yield* resolvePartial(this.file, ctx, this.liquid, LookupType.Partials, this.currentFile)
    if (isControl(resolved)) return
    const { filepath, templates } = resolved
    const childCtx = ctx.spawn()
    const scope = childCtx.bottom()
    Object.assign(scope, yield this.hash.render(ctx))
    if (this.with) scope[this.with.alias || filepath] = yield evalToken(this.with.value, ctx)
    if (!this.forBinding) {
      yield this.liquid.renderer.renderTemplates(templates, childCtx, emitter)
      return
    }
    const collection = toEnumerable(yield evalToken(this.forBinding.value, ctx))
    const alias = this.forBinding.alias || filepath
    const forloop = new ForloopDrop(collection.length, this.forBinding.value.getText(), alias)
    for (const item of collection) {
      scope[alias] = item
      scope['forloop'] = forloop
      yield this.liquid.renderer.renderTemplates(templates, childCtx, emitter)
      forloop.next()
    }
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    return yield* childTemplates(this.file, partials, () =>
      parseTemplates(this.liquid, this.file as string, LookupType.Partials, this.currentFile, options)
    )
  }

  public partialScope(): PartialScope | undefined {
    if (!isString(this.file)) return
    const names: Array<string | [string, Argument]> = Object.keys(this.hash.hash)
    if (this.with) names.push([this.with.alias || this.file, this.with.value])
    if (this.forBinding) {
      names.push('forloop')
      names.push([this.forBinding.alias || this.file, this.forBinding.value])
    }
    return { name: this.file, isolated: true, scope: names }
  }

  public *arguments(): Arguments {
    if (isValueToken(this.file)) yield this.file
    yield* hashValues(this.hash)
    if (this.with && isValueToken(this.with.value)) yield this.with.value
    if (this.forBinding && isValueToken(this.forBinding.value)) yield this.forBinding.value
  }
}
