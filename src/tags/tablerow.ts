import {
  isNil,
  isValueToken,
  toValue,
  toSequence,
  seqAt,
  sliceSequence,
  toLooseInteger,
  isString,
  LiquidRange
} from '../util'
import {
  ValueToken,
  Liquid,
  Tag,
  evalToken,
  Emitter,
  Hash,
  TagToken,
  TopLevelToken,
  Context,
  Template,
  ParseStream
} from '..'
import { TablerowloopDrop } from '../drop/tablerowloop-drop'
import { Parser } from '../parser'
import type { LoopMarkup } from '../parser/strict2'
import { Arguments, blankBodies } from '../template'

export default class extends Tag {
  variable: string
  args: Hash
  templates: Template[]
  collection: ValueToken
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const parsed = tagToken.parsed as LoopMarkup | undefined
    const variable = parsed?.variable ?? this.tokenizer.readIdentifier()
    this.tokenizer.skipBlank()

    const predicate = parsed ? 'in' : this.tokenizer.readIdentifier().content
    const collectionToken = parsed?.collection ?? this.tokenizer.readValue()
    if (predicate !== 'in' || !collectionToken) {
      throw new Error(`illegal tag: ${tagToken.getText()}`)
    }

    this.variable = variable.content
    this.collection = collectionToken
    this.args = new Hash(parsed?.hash ?? this.tokenizer, liquid.options.keyValueSeparator)
    this.templates = []

    let p
    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('start', () => (p = this.templates))
      .on('tag:endtablerow', () => stream.stop())
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })

    stream.start()
    this.blank = blankBodies([this.templates], false)
  }
  public readonly blank: boolean;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const raw = yield evalToken(this.collection, ctx)
    if (isNil(toValue(raw)) || toValue(raw) === false) return
    const args = (yield this.args.render(ctx)) as Record<string, any>
    // an attribute that is given counts even when nil, which reads as 0
    const given = (name: string) => name in this.args.hash
    let collection = toSequence(raw)
    const from = given('offset') ? toLooseInteger(args.offset) : 0
    const to = given('limit') ? from + toLooseInteger(args.limit) : undefined
    // a string is one item, whatever the offset and limit
    if (!isString(toValue(raw))) collection = sliceSequence(collection, from, to)

    const cols = given('cols') ? toLooseInteger(args.cols) : collection.length
    const r = this.liquid.renderer
    const tablerowloop = new TablerowloopDrop(collection.length, cols, this.collection.getText(), this.variable)
    ctx.depthLimit.use(1)
    const scope = ctx.push({ tablerowloop })

    try {
      yield emitter.write('<tr class="row1">\n')
      for (let idx = 0; idx < collection.length; idx++, tablerowloop.next()) {
        if (collection instanceof LiquidRange) ctx.templateLimit.use(1)
        scope[this.variable] = seqAt(collection, idx)
        yield emitter.write(`<td class="col${tablerowloop.col()}">`)
        ctx.continueCalled = ctx.breakCalled = false
        if (this.templates.length) yield r.renderTemplates(this.templates, ctx, emitter)
        yield emitter.write('</td>')
        if (ctx.breakCalled) break
        if (tablerowloop.col_last() && !tablerowloop.last()) {
          yield emitter.write(`</tr>\n<tr class="row${tablerowloop.row() + 1}">`)
        }
      }
      yield emitter.write('</tr>\n')
    } finally {
      ctx.continueCalled = ctx.breakCalled = false
      ctx.pop()
      ctx.depthLimit.release(1)
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public *arguments(): Arguments {
    yield this.collection

    for (const v of Object.values(this.args.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }
  }

  public blockScope(): string[] {
    return [this.variable, 'tablerowloop']
  }
}
