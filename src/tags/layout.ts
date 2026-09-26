import type { OperationOptions } from '../util/operation'
import { Hash, Liquid, Tag, Template, Emitter, TagToken, TopLevelToken, Context, Scope } from '..'
import { BlockMode } from '../context'
import { Parser } from '../parser'
import { Arguments, PartialScope } from '../template'
import { LookupType } from '../fs'
import { isString, isValueToken } from '../util'
import { SimpleEmitter } from '../emitters'
import { isControl } from '../render/control'
import { BlankDrop } from '../drop'
import { hashValues, parseFilePath, parseTemplates, resolvePartial, withDepth, type ParsedFileName } from './partial'

export default class extends Tag {
  private args: Hash
  private templates: Template[]
  private file?: ParsedFileName
  private currentFile?: string

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    this.file = parseFilePath(this.tokenizer, this.liquid, parser)
    this.currentFile = token.file
    this.args = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    this.templates = parser.parseTokens(remainTokens)
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const saved = ctx.saveRegister('blocks', 'blockMode')
    ctx.setRegister('blocks', Object.assign(Object.create(null), ctx.getRegister('blocks')))
    try {
      return yield this.renderLayout(ctx, emitter)
    } finally {
      ctx.restoreRegister(saved)
    }
  }

  private *renderLayout(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    if (this.file === undefined) {
      ctx.setRegister('blockMode', BlockMode.OUTPUT)
      const result = yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
      if (isControl(result)) return result
      return
    }
    return yield* withDepth(ctx, this.renderFile(ctx, emitter))
  }

  private *renderFile(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const resolved = yield* resolvePartial(this.file, ctx, this.liquid, LookupType.Layouts, this.currentFile)
    if (isControl(resolved)) return resolved
    const { templates } = resolved
    ctx.setRegister('blockMode', BlockMode.STORE)
    const captured = new SimpleEmitter(ctx.outputLengthLimit, ctx.operation)
    const control = yield this.liquid.renderer.renderTemplates(this.templates, ctx, captured)
    const blocks = ctx.getRegister('blocks', Object.create(null) as Record<string, any>)
    if (blocks[''] === undefined) {
      blocks[''] = (_parent: BlankDrop, target: Emitter) => target.write(captured.buffer)
    }
    if (isControl(control)) return control
    ctx.setRegister('blockMode', BlockMode.OUTPUT)
    ctx.push((yield this.args.render(ctx)) as Scope)
    try {
      const result = yield this.liquid.renderer.renderTemplates(templates, ctx, emitter)
      if (isControl(result)) return result
    } finally {
      ctx.pop()
    }
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    const templates = this.templates.slice()
    if (Array.isArray(this.file)) templates.unshift(...this.file)
    if (partials && isString(this.file)) {
      templates.push(...(yield* parseTemplates(this.liquid, this.file, LookupType.Layouts, this.currentFile, options)))
    }
    return templates
  }

  public *arguments(): Arguments {
    yield* hashValues(this.args)
    if (isValueToken(this.file)) yield this.file
  }

  public partialScope(): PartialScope | undefined {
    if (isString(this.file)) return { name: this.file, isolated: false, scope: Object.keys(this.args.hash) }
  }
}
