import { Liquid, Tag, Value, TopLevelToken, Template, Emitter, isTruthy, isFalsy, Context, TagToken } from '..'
import { Parser, assertConsumed } from '../parser'
import type { ParsedMarkup } from '../parser/strict2'
import { Arguments, blankBodies, LaxCondition } from '../template'

export default class extends Tag {
  branches: { value: Value; test: (val: any, ctx: Context) => boolean; templates: Template[] }[] = []
  elseTemplates: Template[] = []
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    let p: Template[] = []
    let elseSeen = false
    parser
      .parseStream(remainTokens)
      .on('start', () =>
        this.branches.push({
          value: readCondition(tagToken, this.liquid),
          test: isFalsy,
          templates: (p = [])
        })
      )
      // an else always holds, so what follows the first one is parsed but never reached
      .on('tag:elsif', (token: TagToken) => {
        const branch = { value: readCondition(token, this.liquid), test: isTruthy, templates: (p = []) }
        if (!elseSeen) this.branches.push(branch)
      })
      .on('tag:else', () => {
        p = elseSeen ? [] : this.elseTemplates
        elseSeen = true
      })
      .on('tag:endunless', function () {
        this.stop()
      })
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
      .start()
    this.blank = blankBodies([...this.branches.map(branch => branch.templates), this.elseTemplates], true)
  }
  public readonly blank: boolean;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const r = this.liquid.renderer

    for (const { value, test, templates } of this.branches) {
      const v = yield value.value(ctx, ctx.opts.lenientIf)
      if (test(v, ctx)) {
        yield r.renderTemplates(templates, ctx, emitter)
        return
      }
    }

    yield r.renderTemplates(this.elseTemplates, ctx, emitter)
  }

  public *children(): Generator<unknown, Template[]> {
    const children = this.branches.flatMap(b => b.templates)
    if (this.elseTemplates) {
      children.push(...this.elseTemplates)
    }
    return children
  }

  public arguments(): Arguments {
    return this.branches.map(b => b.value)
  }
}

function readCondition(token: TagToken, liquid: Liquid): Value {
  if (token.laxCondition) return new LaxCondition(token.laxCondition, liquid)
  if (token.parsed) return new Value(token.parsed as ParsedMarkup<'if'>, liquid)
  const value = new Value(token.tokenizer.readFilteredValue(), liquid)
  assertConsumed(token.tokenizer, liquid, value)
  return value
}
