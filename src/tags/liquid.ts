import { Template, Emitter, Liquid, TopLevelToken, TagToken, Context, Tag } from '..'
import { Parser } from '../parser'
import { isControl } from '../render/control'

export default class extends Tag {
  templates: Template[]
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const tokens = this.tokenizer.readLiquidTagTokens(this.liquid.options)
    this.templates = parser.parseTokens(tokens)
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const result = yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    if (isControl(result)) return result
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }
}
