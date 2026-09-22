import { Token } from './token'
import { TokenKind } from '../parser'

export class QuotedToken extends Token {
  public readonly content: string
  constructor(
    public input: string,
    public begin: number,
    public end: number,
    public file?: string
  ) {
    super(TokenKind.Quoted, input, begin, end, file)
    // as in the reference, a string literal has no escapes: its text is its content
    this.content = this.getText().slice(1, -1)
  }
}
