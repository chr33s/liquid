import { Tag, Liquid, TopLevelToken, Emitter, TagToken, Context } from '..'
import { IdentifierToken } from '../tokens'
import { counterName } from './increment'
import { isNumber, stringify } from '../util'

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
    yield emitter.write(stringify(--scope[this.variable]))
  }

  public *localScope(): Iterable<string | IdentifierToken> {
    yield this.identifier
  }
}
