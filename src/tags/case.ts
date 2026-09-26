import {
  ValueToken,
  Liquid,
  toValue,
  evalToken,
  Value,
  Emitter,
  TagToken,
  TopLevelToken,
  Context,
  Template,
  Tag
} from '..'
import { Parser } from '../parser'
import { equals } from '../render'
import { Arguments } from '../template'
import { parseClauses } from '../parser/clauses'
import { isControl } from '../render/control'

export default class extends Tag {
  value: Value
  branches: { values: ValueToken[]; templates: Template[] }[] = []
  elseTemplates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    this.value = new Value(this.tokenizer.readFilteredValue(), this.liquid)
    parseClauses({
      parser,
      remainTokens,
      tagToken,
      end: 'endcase',
      initial: () => [],
      branch: {
        name: 'when',
        afterElse: 'drop',
        open: token => {
          const templates: Template[] = []
          const values: ValueToken[] = []
          while (!token.tokenizer.end()) {
            values.push(token.tokenizer.readValueOrThrow())
            token.tokenizer.skipBlank()
            if (token.tokenizer.peek() === ',') token.tokenizer.readTo(',')
            else token.tokenizer.readTo('or')
          }
          this.branches.push({ values, templates })
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
    const target = toValue(yield this.value.value(ctx, ctx.opts.lenientIf))
    let branchHit = false
    for (const branch of this.branches) {
      for (const valueToken of branch.values) {
        const value = yield evalToken(valueToken, ctx, ctx.opts.lenientIf)
        if (equals(target, value)) {
          const control = yield this.renderBranch(branch.templates, ctx, emitter)
          if (isControl(control)) return control
          branchHit = true
          break
        }
      }
    }
    if (!branchHit) return yield this.renderBranch(this.elseTemplates, ctx, emitter)
  }

  private *renderBranch(templates: Template[], ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const result = yield this.liquid.renderer.renderTemplates(templates, ctx, emitter)
    if (isControl(result)) return result
  }

  public *arguments(): Arguments {
    yield this.value
    yield* this.branches.flatMap(branch => branch.values)
  }

  public *children(): Generator<unknown, Template[]> {
    const templates = this.branches.flatMap(branch => branch.templates)
    if (this.elseTemplates) templates.push(...this.elseTemplates)
    return templates
  }
}
