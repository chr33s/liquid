import { DelimitedToken } from './delimited-token'
import { NormalizedFullOptions } from '../liquid-options'
import type { Operators } from '../render/operator'
import type { LaxMarkup } from '../parser/lax'
import { Tokenizer, TokenKind } from '../parser'

/**
 * LiquidTagToken is different from TagToken by not having delimiters `{%` or `%}`
 */
export class LiquidTagToken extends DelimitedToken {
  public name: string
  public tokenizer: Tokenizer
  /** Where the arguments begin in `input`. */
  public readonly argsBegin: number
  /** In `strict2` mode, what the reference grammar read from the arguments. */
  public parsed?: unknown
  public constructor(input: string, begin: number, end: number, options: NormalizedFullOptions, file?: string) {
    super(TokenKind.Tag, [begin, end], input, begin, end, false, false, file)
    this.tokenizer = new Tokenizer(input, options.operators, file, this.contentRange)
    this.tokenizer.lax = options.errorMode === 'lax'
    this.name = this.tokenizer.readTagName()
    this.tokenizer.assert(this.name, 'illegal liquid tag syntax')
    this.tokenizer.skipBlank()
    this.argsBegin = this.tokenizer.p
  }

  get args(): string {
    return this.rewritten ?? this.tokenizer.input.slice(this.tokenizer.p, this.contentRange[1])
  }

  /** In lax mode, a condition as the reference's lax parser reads it. */
  public laxCondition?: LaxMarkup['condition']
  private rewritten?: string

  /** Read the tag's arguments from `markup` instead, as the lax reading of what was written. */
  public rewrite(markup: string, operators: Operators) {
    this.tokenizer = new Tokenizer(markup, operators, this.file)
    this.rewritten = markup
  }
}
