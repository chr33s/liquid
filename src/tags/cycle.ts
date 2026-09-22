import { TopLevelToken, Liquid, ValueToken, evalToken, Emitter, TagToken, Context, Tag } from '..'
import { Arguments } from '../template'
import { isArray, isLiteralToken, isPropertyAccessToken, literalValues, stringify, toValue } from '../util'
import type { ParsedMarkup } from '../parser/strict2'

let unnamedWithVariables = 0

export default class extends Tag {
  private candidates: ValueToken[] = []
  private group?: ValueToken
  private own = ''
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    const parsed = token.parsed as ParsedMarkup<'cycle'> | undefined
    if (parsed) {
      this.group = parsed.group
      this.candidates = parsed.candidates
    } else this.readMarkup(token)
    // as in the reference, an unnamed cycle over a variable keeps a counter of its own
    if (!this.group && this.candidates.some(isPropertyAccessToken)) this.own = `#${++unnamedWithVariables}`
  }

  private readMarkup(token: TagToken) {
    const group = this.tokenizer.readValue()
    this.tokenizer.skipBlank()

    if (group) {
      if (this.tokenizer.peek() === ':') {
        this.group = group
        this.tokenizer.advance()
      } else this.candidates.push(group)
    }

    while (!this.tokenizer.end()) {
      const value = this.tokenizer.readValue()
      if (value) this.candidates.push(value)
      this.tokenizer.readTo(',')
    }
    this.tokenizer.assert(this.candidates.length, () => `empty candidates: "${token.getText()}"`)
    // the reference's lax and strict grammars leave out a nil value
    const { errorMode } = this.liquid.options
    const values = this.candidates.filter(value => !(isLiteralToken(value) && value.content === literalValues.nil))
    if ((errorMode === 'lax' || errorMode === 'strict') && values.length) this.candidates = values
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const group = (yield evalToken(this.group, ctx)) as ValueToken
    // a named cycle counts by its name alone, an unnamed one by its values
    const values = this.group ? '' : this.candidates.map(value => value.getText()).join(',')
    const fingerprint = `cycle:${group}:${this.own}` + values
    const groups = ctx.getRegister('cycle', {} as Record<string, number>)
    let idx = groups[fingerprint]

    if (idx === undefined) {
      idx = groups[fingerprint] = 0
    }

    const candidate = this.candidates[idx]
    idx = (idx + 1) % this.candidates.length
    groups[fingerprint] = idx
    // rendered as text, so `false` and nil print as the reference prints them
    const value = yield evalToken(candidate, ctx)
    const resolved = toValue(value)
    return isArray(resolved) ? resolved.map(item => stringify(item)).join('') : stringify(value)
  }

  public *arguments(): Arguments {
    yield* this.candidates

    if (this.group) {
      yield this.group
    }
  }
}
