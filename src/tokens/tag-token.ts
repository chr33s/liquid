import { DelimitedToken } from './delimited-token'
import { Tokenizer, TokenKind } from '../parser'
import type { NormalizedFullOptions } from '../liquid-options'
import type { TokenizationError } from '../util/error'
import type { Operators } from '../render/operator'
import type { LaxMarkup } from '../parser/lax'

export class TagToken extends DelimitedToken {
  public name: string
  public tokenizer: Tokenizer
  public readonly args: string
  /** Where the arguments begin in `input`. */
  public readonly argsBegin: number
  /** In `strict2` mode, what the reference grammar read from the arguments. */
  public parsed?: unknown
  public readonly malformed?: TokenizationError
  /** In lax mode, a condition as the reference's lax parser reads it. */
  public laxCondition?: LaxMarkup['condition']
  public constructor(input: string, begin: number, end: number, options: NormalizedFullOptions, file?: string) {
    const { trimTagLeft, trimTagRight, tagDelimiterLeft, tagDelimiterRight } = options
    const [valueBegin, valueEnd] = [begin + tagDelimiterLeft.length, end - tagDelimiterRight.length]
    super(TokenKind.Tag, [valueBegin, valueEnd], input, begin, end, trimTagLeft, trimTagRight, file)

    this.tokenizer = new Tokenizer(input, options.operators, file, this.contentRange)
    this.tokenizer.lax = options.errorMode === 'lax'
    this.name = this.tokenizer.readTagName()
    // as the reference, a tag name is `#` or starts with a word character; one that is not, like `{%%}`,
    // is rejected when it is parsed, so a comment can still hold it
    if (!/^(#|[A-Za-z0-9_])/.test(this.name)) this.malformed = this.tokenizer.error(`Unknown tag '${this.getText()}'`)
    this.tokenizer.skipBlank()
    this.argsBegin = this.tokenizer.p
    this.args = this.tokenizer.input.slice(this.tokenizer.p, this.contentRange[1])
  }

  /** Read the tag's arguments from `markup` instead, as the lax reading of what was written. */
  public rewrite(markup: string, operators: Operators) {
    this.tokenizer = new Tokenizer(markup, operators, this.file)
    ;(this as { args: string }).args = markup
  }
}
