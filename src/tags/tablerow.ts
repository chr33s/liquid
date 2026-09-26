import { isValueToken, toEnumerable } from '../util'
import { Liquid, Tag, Emitter, Hash, TagToken, TopLevelToken, Context, Template, evalToken } from '..'
import { TablerowloopDrop } from '../drop/tablerowloop-drop'
import { Parser } from '../parser'
import { Arguments } from '../template'
import { parseClauses } from '../parser/clauses'
import { isControl } from '../render/control'
import { readIteration } from './iteration'

export default class extends Tag {
  variable: string
  args: Hash
  templates: Template[] = []
  collection: import('../tokens').ValueToken

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const header = readIteration(this.tokenizer, tagToken)
    this.variable = header.variable
    this.collection = header.collection
    this.args = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    parseClauses({
      parser,
      remainTokens,
      tagToken,
      end: 'endtablerow',
      initial: () => this.templates
    })
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    let collection = toEnumerable(yield evalToken(this.collection, ctx))
    const args = (yield this.args.render(ctx)) as Record<string, any>
    const offset = args.offset || 0
    const limit = args.limit === undefined ? collection.length : args.limit
    collection = collection.slice(offset, offset + limit)
    if (!collection.length || !this.templates.length) return

    const cols = args.cols || collection.length
    const tablerowloop = new TablerowloopDrop(collection.length, cols, this.collection.getText(), this.variable)
    const scope = ctx.push({ tablerowloop })
    let control: unknown
    try {
      for (let idx = 0; idx < collection.length; idx++, tablerowloop.next()) {
        scope[this.variable] = collection[idx]
        if (tablerowloop.col0() === 0) {
          if (tablerowloop.row() !== 1) yield emitter.write('</tr>')
          yield emitter.write(`<tr class="row${tablerowloop.row()}">`)
        }
        yield emitter.write(`<td class="col${tablerowloop.col()}">`)
        if (!isControl(control)) {
          const result = yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
          if (isControl(result)) control = result
        }
        yield emitter.write('</td>')
      }
      if (collection.length) yield emitter.write('</tr>')
    } finally {
      ctx.pop()
    }
    if (isControl(control)) return control
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public *arguments(): Arguments {
    yield this.collection
    for (const value of Object.values(this.args.hash)) {
      if (isValueToken(value)) yield value
    }
  }

  public blockScope(): string[] {
    return [this.variable, 'tablerowloop']
  }
}
