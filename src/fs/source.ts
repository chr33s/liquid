import type { FileReadOptions } from './fs'
import { LiquidLimitError } from '../util/error'

export class SourceReader {
  private bytes = 0
  private units = 0
  private decoder: TextDecoder
  constructor(
    private options: FileReadOptions,
    preserveBOM = false
  ) {
    this.decoder = new TextDecoder('utf-8', { ignoreBOM: preserveBOM })
  }
  decode(chunk?: Uint8Array): string {
    this.options.signal?.throwIfAborted()
    this.bytes += chunk?.byteLength ?? 0
    if (this.bytes > (this.options.sourceByteLimit ?? Infinity))
      throw new LiquidLimitError('source byte limit exceeded')
    const text = chunk ? this.decoder.decode(chunk, { stream: true }) : this.decoder.decode()
    this.units += text.length
    if (this.units > (this.options.sourceCodeUnitLimit ?? Infinity)) {
      throw new LiquidLimitError('parse length limit exceeded')
    }
    return text
  }
}
