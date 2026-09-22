import { Liquid, Tag, Value, Emitter, isTruthy, TagToken, TopLevelToken, Context, Template } from '..'
import { Parser, assertConsumed } from '../parser'
import type { ParsedMarkup } from '../parser/strict2'
import { Arguments, blankBodies, LaxCondition } from '../template'

export default class extends Tag {
  branches: { value: Value; templates: Template[] }[] = []
  elseTemplates: Template[] | undefined

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    let p: Template[] = []
    parser
      .parseStream(remainTokens)
      .on('start', () =>
        this.branches.push({
          value: readCondition(tagToken, this.liquid),
          templates: (p = [])
        })
      )
      // an else always holds, so what follows the first one is parsed but never reached
      .on('tag:elsif', (token: TagToken) => {
        const branch = { value: readCondition(token, this.liquid), templates: (p = []) }
        if (!this.elseTemplates) this.branches.push(branch)
      })
      .on<TagToken>('tag:else', () => {
        p = []
        if (!this.elseTemplates) this.elseTemplates = p
      })
      .on<TagToken>('tag:endif', function () {
        this.stop()
      })
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
      .start()
    this.blank = blankBodies([...this.branches.map(branch => branch.templates), this.elseTemplates ?? []], true)
  }
  public readonly blank: boolean;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, string> {
    const r = this.liquid.renderer

    for (const { value, templates } of this.branches) {
      const v = yield value.value(ctx, ctx.opts.lenientIf)
      if (isTruthy(v, ctx)) {
        yield r.renderTemplates(templates, ctx, emitter)
        return
      }
    }
    yield r.renderTemplates(this.elseTemplates || [], ctx, emitter)
  }

  public *children(): Generator<unknown, Template[]> {
    const templates = this.branches.flatMap(b => b.templates)
    if (this.elseTemplates) {
      templates.push(...this.elseTemplates)
    }
    return templates
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
