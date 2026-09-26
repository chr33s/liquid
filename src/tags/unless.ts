import { Liquid, Tag, Value, TopLevelToken, Template, Emitter, isTruthy, isFalsy, Context, TagToken } from '..'
import { Parser } from '../parser'
import { Arguments } from '../template'
import { parseClauses } from '../parser/clauses'
import { isControl } from '../render/control'

export default class extends Tag {
  branches: { value: Value; test: (val: any, ctx: Context) => boolean; templates: Template[] }[] = []
  elseTemplates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    parseClauses({
      parser,
      remainTokens,
      tagToken,
      end: 'endunless',
      initial: () => {
        const templates: Template[] = []
        this.branches.push({
          value: new Value(tagToken.tokenizer.readFilteredValue(), this.liquid),
          test: isFalsy,
          templates
        })
        return templates
      },
      branch: {
        name: 'elsif',
        afterElse: 'drop',
        open: token => {
          const templates: Template[] = []
          this.branches.push({
            value: new Value(token.tokenizer.readFilteredValue(), this.liquid),
            test: isTruthy,
            templates
          })
          return templates
        }
      },
      else: {
        policy: 'first',
        open: () => this.elseTemplates
      }
    })
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    for (const { value, test, templates } of this.branches) {
      const v = yield value.value(ctx, ctx.opts.lenientIf)
      if (test(v, ctx)) return yield this.renderBranch(templates, ctx, emitter)
    }
    return yield this.renderBranch(this.elseTemplates, ctx, emitter)
  }

  private *renderBranch(templates: Template[], ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const result = yield this.liquid.renderer.renderTemplates(templates, ctx, emitter)
    if (isControl(result)) return result
  }

  public *children(): Generator<unknown, Template[]> {
    const children = this.branches.flatMap(branch => branch.templates)
    if (this.elseTemplates) children.push(...this.elseTemplates)
    return children
  }

  public arguments(): Arguments {
    return this.branches.map(branch => branch.value)
  }
}
