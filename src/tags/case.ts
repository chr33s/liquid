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
  Tag,
  ParseStream
} from '..'
import { Parser } from '../parser'
import { markupOf, tagMarkup, type ParsedMarkup } from '../parser/strict2'
import { equals } from '../render'
import { ParseError } from '../util'
import { Arguments, blankBodies } from '../template'

export default class extends Tag {
  value: Value
  /** The `when` and `else` blocks in source order; an `else` block has no values. */
  branches: { values: ValueToken[]; templates: Template[]; else?: boolean }[] = []
  /** The templates of the first `else` block. */
  elseTemplates: Template[] = []
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const parsed = tagToken.parsed as ParsedMarkup<'case'> | undefined
    this.value = new Value(parsed ?? this.tokenizer.readFilteredValue(), this.liquid)
    this.elseTemplates = []

    let p: Template[] = []
    const leading = p
    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('tag:when', (token: TagToken) => {
        p = []

        const values: ValueToken[] = (token.parsed as ParsedMarkup<'when'> | undefined) ?? []
        while (!token.parsed && !token.tokenizer.end()) {
          values.push(token.tokenizer.readValueOrThrow())
          token.tokenizer.skipBlank()
          if (token.tokenizer.peek() === ',') {
            token.tokenizer.readTo(',')
          } else {
            token.tokenizer.readTo('or')
          }
        }
        this.branches.push({
          values,
          templates: p
        })
      })
      .on('tag:else', (token: TagToken) => {
        try {
          tagMarkup.else(markupOf(token), { parent: 'case' })
        } catch (e) {
          throw new ParseError(e as Error, token)
        }
        p = []
        if (!this.branches.some(branch => branch.else)) this.elseTemplates = p
        this.branches.push({ values: [], templates: p, else: true })
      })
      .on('tag:endcase', () => stream.stop())
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })

    stream.start()
    this.blank = blankBodies([leading, ...this.branches.map(branch => branch.templates)], true)
  }
  public readonly blank: boolean;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const r = this.liquid.renderer
    const target = toValue(yield this.value.value(ctx, ctx.opts.lenientIf))
    // as in the reference, every matching `when` renders, and an `else` renders
    // when no `when` before it has matched
    let branchHit = false
    for (const branch of this.branches) {
      if (branch.else) {
        if (!branchHit) yield r.renderTemplates(branch.templates, ctx, emitter)
        continue
      }
      for (const valueToken of branch.values) {
        const value = yield evalToken(valueToken, ctx, ctx.opts.lenientIf)
        // each matching value renders the body, as in the reference
        if (equals(target, value)) {
          yield r.renderTemplates(branch.templates, ctx, emitter)
          branchHit = true
        }
      }
    }
  }

  public *arguments(): Arguments {
    yield this.value
    yield* this.branches.flatMap(b => b.values)
  }

  public *children(): Generator<unknown, Template[]> {
    return this.branches.flatMap(b => b.templates)
  }
}
