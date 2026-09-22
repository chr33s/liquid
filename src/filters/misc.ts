import { isFalsy } from '../render/boolean'
import { isArray, isString, toArray, toValue } from '../util/underscore'
import { LiquidRange } from '../util/sequence'
import { FilterImpl } from '../template'

function defaultFilter<T1 extends boolean, T2>(
  this: FilterImpl,
  value: T1,
  defaultValue: T2,
  options?: Record<string, unknown>
): T1 | T2 {
  const resolved = toValue(value)
  if (isArray(resolved) || isString(resolved)) return resolved.length ? value : defaultValue
  if (resolved === false && toValue(options?.allow_false)) return false as T1
  if (isEmptyObject(resolved)) return defaultValue
  return isFalsy(resolved, this.context) ? defaultValue : value
}

function isEmptyObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false
  if (value instanceof Map || value instanceof Set) return value.size === 0
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return false
  return Object.keys(value).length === 0
}

export function json(this: FilterImpl, value: any, space = 0) {
  return JSON.stringify(toValue(value) instanceof LiquidRange ? toArray(value) : value, undefined, space)
}

export default {
  default: defaultFilter
}
