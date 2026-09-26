import { Tag, Emitter, Context } from '..'
import { Continue } from '../render/control'

export default class extends Tag {
  render(_ctx: Context, _emitter: Emitter) {
    return Continue
  }
}
