import type { OperationOptions } from '../util/operation'
import { Hash, Liquid, Tag, Template, Emitter, TagToken, TopLevelToken, Context, evalToken, ValueToken } from '..'
import { BlockMode, Scope } from '../context'
import { Parser } from '../parser'
import { Argument, Arguments, PartialScope } from '../template'
import { LookupType } from '../fs'
import { isString, isValueToken } from '../util'
import { isControl } from '../render/control'
import {
  childTemplates,
  parseFilePath,
  parseTemplates,
  readKeyword,
  resolvePartial,
  withDepth,
  type ParsedFileName
} from './partial'

export default class extends Tag {
  private file: ParsedFileName
  private currentFile?: string
  private withVar?: ValueToken
  private hash: Hash

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const { tokenizer } = token
    this.file = parseFilePath(tokenizer, this.liquid, parser)
    this.currentFile = token.file
    this.withVar = readKeyword(tokenizer, 'with')?.value
    this.hash = new Hash(tokenizer, liquid.options.jekyllInclude || liquid.options.keyValueSeparator)
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const saved = ctx.saveRegister('blocks', 'blockMode')
    ctx.setRegister('blocks', Object.create(null))
    ctx.setRegister('blockMode', BlockMode.OUTPUT)
    try {
      return yield* withDepth(ctx, this.renderPartial(ctx, emitter))
    } finally {
      ctx.restoreRegister(saved)
    }
  }

  private *renderPartial(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const resolved = yield* resolvePartial(this.file, ctx, this.liquid, LookupType.Partials, this.currentFile)
    if (isControl(resolved)) return
    const { filepath, templates } = resolved
    const scope = (yield this.hash.render(ctx)) as Scope
    if (this.withVar) scope[filepath] = yield evalToken(this.withVar, ctx)
    ctx.push(ctx.opts.jekyllInclude ? { include: scope } : scope)
    try {
      const control = yield this.liquid.renderer.renderTemplates(templates, ctx, emitter)
      if (isControl(control)) return control
    } finally {
      ctx.pop()
    }
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    return yield* childTemplates(this.file, partials, () =>
      parseTemplates(this.liquid, this.file as string, LookupType.Partials, this.currentFile, options)
    )
  }

  public partialScope(): PartialScope | undefined {
    if (!isString(this.file)) return
    const names: Array<string | [string, Argument]> = this.liquid.options.jekyllInclude
      ? ['include']
      : Object.keys(this.hash.hash)
    if (!this.liquid.options.jekyllInclude && this.withVar) names.push([this.file, this.withVar])
    return { name: this.file, isolated: false, scope: names }
  }

  public *arguments(): Arguments {
    yield* Object.values(this.hash.hash).filter(isValueToken)
    if (isValueToken(this.file)) yield this.file
    if (this.withVar && isValueToken(this.withVar)) yield this.withVar
  }
}
