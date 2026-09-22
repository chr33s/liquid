import { Liquid, TopLevelToken, TagToken, Tag } from '..'
import { isTagToken } from '../util'

export default class extends Tag {
  /**
   * The documentation body, retained for tooling but never executed.
   */
  public readonly body: string

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    const parts: string[] = []
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (isTagToken(token)) {
        if (token.name === 'enddoc') {
          this.body = parts.join('')
          return
        }
      }
      parts.push(token.getText())
    }
    throw new Error(`'${tagToken.name}' tag was never closed`)
  }
  get blank() {
    return this.body === ''
  }
  render() {}
}
