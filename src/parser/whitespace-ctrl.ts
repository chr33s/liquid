import { Token } from '../tokens'
import { NormalizedFullOptions } from '../liquid-options'
import { isTagToken, isHTMLToken, isDelimitedToken, TYPES, INLINE_BLANK, BLANK } from '../util'

export function whiteSpaceCtrl(tokens: Token[], options: NormalizedFullOptions) {
  let inRaw = false
  const keepFirst = options.bugCompatibleWhitespaceTrimming

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!isDelimitedToken(token)) continue
    if (!inRaw && token.trimLeft) {
      trimLeft(tokens[i - 1], options.greedy, keepFirst)
    }

    if (isTagToken(token)) {
      if (token.name === 'raw') inRaw = true
      else if (token.name === 'endraw') inRaw = false
    }

    if (!inRaw && token.trimRight) {
      trimRight(tokens[i + 1], options.greedy)
    }
  }
}

/** With `keepFirst`, text the trim empties keeps its first character. */
function trimLeft(token: Token, greedy: boolean, keepFirst = false) {
  if (!token || !isHTMLToken(token)) return

  const size = token.end - token.begin
  const kept = size - token.trimLeft - token.trimRight
  const mask = greedy ? BLANK : INLINE_BLANK
  while (TYPES[token.input.charCodeAt(token.end - 1 - token.trimRight)] & mask) token.trimRight++
  if (keepFirst && kept > 0 && token.trimLeft + token.trimRight >= size) token.trimRight = size - token.trimLeft - 1
}

function trimRight(token: Token, greedy: boolean) {
  if (!token || !isHTMLToken(token)) return

  const mask = greedy ? BLANK : INLINE_BLANK
  while (TYPES[token.input.charCodeAt(token.begin + token.trimLeft)] & mask) token.trimLeft++
  if (token.input.charAt(token.begin + token.trimLeft) === '\n') token.trimLeft++
}
