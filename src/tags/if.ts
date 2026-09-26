import { Liquid, Tag, Value, Emitter, isTruthy, TagToken, TopLevelToken, Context, Template } from '..'
import { Parser } from '../parser'
import { Arguments } from '../template'
import { parseClauses } from '../parser/clauses'
import { isControl } from '../render/control'

export default class extends Tag {
  branches: { value: Value; templates: Template[] }[] = []
  elseTemplates: Template[] | undefined

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    parseClauses({
      parser,
      remainTokens,
      tagToken,
      end: 'endif',
      strictEnd: true,
      initial: () => {
        const templates: Template[] = []
        this.branches.push({ value: new Value(tagToken.tokenizer.readFilteredValue(), this.liquid), templates })
        return templates
      },
      branch: {
        name: 'elsif',
        afterElse: 'reject',
        open: token => {
          const templates: Template[] = []
          this.branches.push({ value: new Value(token.tokenizer.readFilteredValue(), this.liquid), templates })
          return templates
        }
      },
      else: {
        policy: 'reject',
        strict: true,
        open: () => (this.elseTemplates = [])
      }
    })
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    for (const { value, templates } of this.branches) {
      const v = yield value.value(ctx, ctx.opts.lenientIf)
      if (isTruthy(v, ctx)) return yield this.renderBranch(templates, ctx, emitter)
    }
    return yield this.renderBranch(this.elseTemplates || [], ctx, emitter)
  }

  private *renderBranch(templates: Template[], ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const result = yield this.liquid.renderer.renderTemplates(templates, ctx, emitter)
    if (isControl(result)) return result
  }

  public *children(): Generator<unknown, Template[]> {
    const templates = this.branches.flatMap(branch => branch.templates)
    if (this.elseTemplates) templates.push(...this.elseTemplates)
    return templates
  }

  public arguments(): Arguments {
    return this.branches.map(branch => branch.value)
  }
}
