import type { OperationOptions } from '../util/operation'
import { Scope, Template, Liquid, Tag, assert, Emitter, Hash, TagToken, TopLevelToken, Context } from '..'
import { BlockMode } from '../context'
import { parseFilePath, renderFilePath, ParsedFileName } from './render'
import { BlankDrop } from '../drop'
import { Parser } from '../parser'
import { Arguments, PartialScope } from '../template'
import { isString, isValueToken } from '../util'

export default class extends Tag {
  args: Hash
  templates: Template[]
  file?: ParsedFileName
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
    const { liquid, args, file } = this
    const { renderer } = liquid
    if (file === undefined) {
      ctx.setRegister('blockMode', BlockMode.OUTPUT)
      yield renderer.renderTemplates(this.templates, ctx, emitter)
      return
    }
    ctx.depthLimit.use(1)
    try {
      const filepath = (yield renderFilePath(this.file, ctx, liquid)) as string
      assert(filepath, () => `illegal file path "${filepath}"`)
      const templates = (yield liquid._parseLayoutFile(filepath, this.currentFile, ctx.operationOptions)) as Template[]

      // render remaining contents and store rendered results
      ctx.setRegister('blockMode', BlockMode.STORE)
      const html = yield renderer.renderTemplates(this.templates, ctx)
      const blocks = ctx.getRegister('blocks', Object.create(null) as Record<string, any>)

      // set whole content to anonymous block if anonymous doesn't specified
      if (blocks[''] === undefined) blocks[''] = (parent: BlankDrop, emitter: Emitter) => emitter.write(html)
      ctx.setRegister('blockMode', BlockMode.OUTPUT)

      // render the layout file use stored blocks
      ctx.push((yield args.render(ctx)) as Scope)
      try {
        yield renderer.renderTemplates(templates, ctx, emitter)
      } finally {
        ctx.pop()
      }
    } finally {
      ctx.depthLimit.release(1)
    }
  }

  public *children(partials: boolean, options?: OperationOptions): Generator<unknown, Template[]> {
    const templates = this.templates.slice()
    if (Array.isArray(this.file)) templates.unshift(...this.file)

    if (partials && isString(this.file)) {
      templates.push(...((yield this.liquid._parseLayoutFile(this.file, this.currentFile, options)) as Template[]))
    }

    return templates
  }

  public *arguments(): Arguments {
    for (const v of Object.values(this.args.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }

    if (isValueToken(this.file)) {
      yield this.file
    }
  }

  public partialScope(): PartialScope | undefined {
    if (isString(this.file)) {
      return { name: this.file, isolated: false, scope: Object.keys(this.args.hash) }
    }
  }
}
