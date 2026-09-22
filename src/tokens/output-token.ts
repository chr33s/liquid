import { DelimitedToken } from './delimited-token'
import { NormalizedFullOptions } from '../liquid-options'
import { TokenKind } from '../parser'

export class OutputToken extends DelimitedToken {
  /** False when a tag opened before the output closed, which the `strict2` grammar rejects. */
  public terminated = true
  public constructor(input: string, begin: number, end: number, options: NormalizedFullOptions, file?: string) {
    const { trimOutputLeft, trimOutputRight, outputDelimiterLeft, outputDelimiterRight } = options
    const valueRange: [number, number] = [begin + outputDelimiterLeft.length, end - outputDelimiterRight.length]
    super(TokenKind.Output, valueRange, input, begin, end, trimOutputLeft, trimOutputRight, file)
  }
}
