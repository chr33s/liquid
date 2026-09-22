import { Drop, hideMembers } from './drop'

const HIDDEN = hideMembers('toString')
import type { Context } from '../context'

/**
 * The context a SelfDrop reads, held outside the drop so that no template can
 * reach it through an ordinary property read.
 */
const origins = new WeakMap<SelfDrop, Context>()

/**
 * Backs `{{ self[key] }}`: a dynamic lookup that follows ordinary scope
 * precedence and exposes nothing of the context itself.
 */
export class SelfDrop extends Drop {
  public constructor(origin: Context) {
    super()
    origins.set(this, origin)
  }
  public hiddenMembers() {
    return HIDDEN
  }
  public liquidMethodMissing(key: string | number) {
    return origins.get(this)!._get([key], false)
  }
  /** The reference's `to_s` of the drop, its class name. */
  public toString() {
    return 'Liquid::SelfDrop'
  }
}
