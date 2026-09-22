import { Emitter, SimpleEmitter } from '../emitters'
import type { Context } from '../context'
import { Drop } from './drop'

export class BlockDrop extends Drop {
  constructor(
    // the block render from layout template
    private superBlockRender: (emitter: Emitter) => IterableIterator<unknown> | string = () => '',
    private ctx?: Context
  ) {
    super()
  }
  /**
   * Provide parent access in child block by
   * {{ block.super }}
   */
  public *super(): IterableIterator<unknown> {
    const emitter = new SimpleEmitter(this.ctx?.outputLengthLimit, this.ctx?.operation)
    yield this.superBlockRender(emitter)
    return emitter.buffer
  }
}
