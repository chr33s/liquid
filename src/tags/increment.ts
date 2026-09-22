import { isNumber, stringify } from '../util'
import { Tag, Liquid, TopLevelToken, Emitter, TagToken, Context } from '..'
import { IdentifierToken } from '../tokens'

export default class extends Tag {
  private identifier: IdentifierToken
  private variable: string
  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    this.identifier = (token.parsed as IdentifierToken | undefined) ?? counterName(token, liquid)
    this.variable = this.identifier.content
  }
  *render(context: Context, emitter: Emitter) {
    const scope = context.environments
    if (!isNumber(scope[this.variable])) {
      scope[this.variable] = 0
    }
    const val = scope[this.variable]
    scope[this.variable]++
    yield emitter.write(stringify(val))
  }

  public *localScope(): Iterable<string | IdentifierToken> {
    yield this.identifier
  }
}

/** The reference's lax and strict grammars name a counter by its whole markup, `{% increment a b %}` by `a b`. */
export function counterName(token: TagToken, liquid: Liquid): IdentifierToken {
  const { errorMode } = liquid.options
  if (errorMode !== 'lax' && errorMode !== 'strict') return token.tokenizer.readIdentifier()
  return new IdentifierToken(token.input, token.argsBegin, token.argsBegin + token.args.length, token.file)
}
