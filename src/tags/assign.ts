import { Value, Liquid, TopLevelToken, TagToken, Context, Tag } from '..'
import { Arguments } from '../template'
import { IdentifierToken, QuotedToken } from '../tokens'
import { assertConsumed } from '../parser'
import type { ParsedMarkup } from '../parser/strict2'

export default class extends Tag {
  public readonly blank = true
  private key: string
  private value: Value
  private identifier: IdentifierToken | QuotedToken

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const parsed = token.parsed as ParsedMarkup<'assign'> | undefined
    if (parsed) {
      this.identifier = parsed.name
      this.key = parsed.name.content
      this.value = new Value(parsed.value, this.liquid)
      return
    }
    const name = this.tokenizer.readIdentifier()
    // a quoted name is what the lax reading makes of a name that is no identifier
    this.identifier = name.content ? name : (this.tokenizer.readQuoted() ?? name)
    this.key = this.identifier.content
    this.tokenizer.assert(this.key, 'expected variable name')

    this.tokenizer.skipBlank()
    this.tokenizer.assert(this.tokenizer.peek() === '=', 'expected "="')

    this.tokenizer.advance()
    this.value = new Value(this.tokenizer.readFilteredValue(), this.liquid)
    assertConsumed(this.tokenizer, this.liquid, this.value)
  }
  *render(ctx: Context): Generator<unknown, void, unknown> {
    ctx.setBottom(this.key, yield this.value.value(ctx, this.liquid.options.lenientIf))
  }

  public *arguments(): Arguments {
    yield this.value
  }

  public *localScope(): Iterable<IdentifierToken | QuotedToken> {
    yield this.identifier
  }
}
