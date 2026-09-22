import { Value } from './value'
import { Arguments, Template, TemplateImpl } from '../template'
import { Context } from '../context/context'
import { Emitter } from '../emitters/emitter'
import { OutputToken } from '../tokens/output-token'
import { Tokenizer, assertConsumed } from '../parser'
import { laxOutput } from '../parser/lax'
import { variable } from '../parser/strict2'
import { Liquid } from '../liquid'
import { Filter } from './filter'
import { FilterToken, FilteredValueToken } from '../tokens'

export class Output extends TemplateImpl<OutputToken> implements Template {
  value: Value
  private outputEscape?: Filter
  public constructor(token: OutputToken, liquid: Liquid) {
    super(token)
    if (liquid.options.errorMode === 'strict2') {
      const [begin, end] = token.contentRange
      const value = variable({ input: token.input, begin, end, file: token.file })
      this.value = new Value(value ?? new Tokenizer('nil').readFilteredValue(), liquid)
    } else {
      const tokenizer = new Tokenizer(token.input, liquid.options.operators, token.file, token.contentRange)
      tokenizer.lax = liquid.options.errorMode === 'lax'
      this.value = new Value(readOutput(tokenizer, liquid), liquid)
      assertConsumed(tokenizer, liquid, this.value)
    }
    const outputEscape = liquid.options.outputEscape
    if (outputEscape) {
      const token = new FilterToken(toString.call(outputEscape), [], '', 0, 0)
      this.outputEscape = new Filter(token, outputEscape, liquid)
    }
  }
  public *render(ctx: Context, emitter: Emitter): IterableIterator<unknown> {
    const val = yield this.value.value(ctx, false, this.outputEscape)
    yield emitter.write(val)
  }

  public *arguments(): Arguments {
    yield this.value
  }
}

/** Empty markup, `{{ }}`, renders nil; lax mode reads other markup as the reference's lax parser does. */
function readOutput(tokenizer: Tokenizer, liquid: Liquid): FilteredValueToken {
  const { operators } = liquid.options
  if (liquid.options.errorMode === 'lax') {
    const rewritten = laxOutput(tokenizer.input.slice(tokenizer.p, tokenizer.N), operators)
    if (rewritten !== undefined) return new Tokenizer(rewritten, operators, tokenizer.file).readFilteredValue()
  }
  const begin = tokenizer.p
  tokenizer.skipBlank()
  if (!tokenizer.end()) {
    tokenizer.p = begin
    return tokenizer.readFilteredValue()
  }
  return new Tokenizer('nil', operators).readFilteredValue()
}
