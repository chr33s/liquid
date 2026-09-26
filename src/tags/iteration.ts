import type { Tokenizer } from '../parser'
import type { TagToken, ValueToken } from '../tokens'

export function readIteration(tokenizer: Tokenizer, token: TagToken): { variable: string; collection: ValueToken } {
  const variable = tokenizer.readIdentifier()
  tokenizer.skipBlank()
  const keyword = tokenizer.readIdentifier()
  const collection = tokenizer.readValue()
  if (!variable.size() || keyword.content !== 'in' || !collection) {
    throw new Error(`illegal tag: ${token.getText()}`)
  }
  return { variable: variable.content, collection }
}
