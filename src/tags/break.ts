import { Context, Emitter, Tag } from '..'
import { Break } from '../render/control'

export default class extends Tag {
  render(_ctx: Context, _emitter: Emitter) {
    return Break
  }
}
