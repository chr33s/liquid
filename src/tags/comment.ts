import { Liquid, TopLevelToken, TagToken, Tag } from '..'
import { isTagToken } from '../util'

export default class extends Tag {
  public readonly blank = true
  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    let depth = 1
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (!isTagToken(token)) continue
      // as the reference, a raw tag inside a comment has to close, whatever its arguments
      const closed = remainTokens.slice(0, 2).some(next => isTagToken(next) && next.name === 'endraw')
      // and is reported at the comment's line
      if (token.name === 'raw' && !closed) throw tagToken.tokenizer.error("'raw' tag was never closed", tagToken.begin)
      if (token.name === 'comment') depth++
      else if (token.name === 'endcomment' && --depth === 0) return
    }
    // its body is skipped rather than parsed, so the reference reports it at the comment's line
    throw tagToken.tokenizer.error(`'${tagToken.name}' tag was never closed`, tagToken.begin)
  }
  render() {}
}
