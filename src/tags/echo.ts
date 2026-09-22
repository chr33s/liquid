import { Liquid, TopLevelToken, Emitter, Value, TagToken, Context, Tag } from '..'
import { Arguments } from '../template'
import { assertConsumed } from '../parser'
import type { ParsedMarkup } from '../parser/strict2'

export default class extends Tag {
  private value?: Value

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const parsed = token.parsed as ParsedMarkup<'echo'> | undefined
    if (parsed) {
      if (parsed.value) this.value = new Value(parsed.value, this.liquid)
      return
    }
    this.tokenizer.skipBlank()
    if (!this.tokenizer.end()) {
      this.value = new Value(this.tokenizer.readFilteredValue(), this.liquid)
      assertConsumed(this.tokenizer, this.liquid, this.value)
    }
  }
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    if (!this.value) return
    const val = yield this.value.value(ctx, false)
    yield emitter.write(val)
  }

  public *arguments(): Arguments {
    if (this.value) {
      yield this.value
    }
  }
}
