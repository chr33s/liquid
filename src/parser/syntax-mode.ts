import type { Liquid } from '../liquid'
import type { Value } from '../template/value'
import type { Tokenizer } from './tokenizer'

/**
 * Reject (strict, strict2), record (warn) or ignore (lax) markup the grammar could not
 * join into a single expression, mirroring the reference engine's error modes.
 */
export function assertConsumed(tokenizer: Tokenizer, liquid: Liquid, value?: Value): void {
  const { errorMode } = liquid.options
  if (errorMode === 'lax') return
  tokenizer.skipBlank()
  const trailing = tokenizer.input.slice(tokenizer.p, tokenizer.N).trim()
  const dangling = value !== undefined && !value.initial.complete
  if (!trailing && !dangling) return
  const error = tokenizer.error(
    `unexpected token "${trailing || danglingText(value!)}"`,
    trailing ? tokenizer.p : value!.initial.postfix[value!.initial.postfix.length - 1].begin
  )
  if (errorMode === 'strict' || errorMode === 'strict2') throw error
  liquid.warnings.push(error.message)
  tokenizer.p = tokenizer.N
}

function danglingText(value: Value): string {
  const { postfix } = value.initial
  return postfix[postfix.length - 1].getText()
}
