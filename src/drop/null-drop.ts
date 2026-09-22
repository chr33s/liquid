import { Drop } from './drop'
import { BlankDrop } from './blank-drop'
import { Comparable } from './comparable'
import { isNil, toValue } from '../util'

export class NullDrop extends Drop implements Comparable {
  public equals(value: any) {
    return value instanceof BlankDrop || isNil(toValue(value))
  }
  public gt() {
    return false
  }
  public geq() {
    return false
  }
  public lt() {
    return false
  }
  public leq() {
    return false
  }
  public valueOf() {
    return null
  }
}
