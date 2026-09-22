import {
  toArray,
  argumentsToValue,
  toValue,
  stringify,
  caseInsensitiveCompare,
  orderedCompare,
  isArray,
  isNil,
  isArrayLike,
  isNumber,
  isObject,
  readArrayElement,
  inputIterator,
  toNumber,
  isPlainObject,
  toInteger
} from '../util'
import { plus } from './math'
import { FloatDrop, isDecimal } from '../drop/float-drop'
import { equals, isTruthy } from '../render'
import { assert, isString, LiquidRange } from '../util'
import { FilterImpl } from '../template'
import type { Scope } from '../context'

/**
 * Standard property filters take a literal key: `a.b` names the key "a.b",
 * not a nested lookup.
 */
function* readProperty(this: FilterImpl, item: unknown, property: unknown): IterableIterator<unknown> {
  const key = toValue(property)
  // as the reference's `Integer#[]` and `Array#[]`, a name cannot index an integer or an array
  const indexed = toValue(item)
  const indexable = isArray(indexed) || typeof indexed === 'bigint' || (isNumber(indexed) && !isDecimal(item))
  assert(!indexable || isNumber(key), () => `cannot select the property '${stringify(property)}'`)
  // as in the reference's `String#[]`: an index reads a character, a string reads itself if contained
  const value = toValue(item)
  if (isString(value)) {
    // `String#[]` takes no nil
    assert(!isNil(key), () => `cannot select the property '${stringify(property)}'`)
    if (isNumber(key)) return value.charAt(key < 0 ? value.length + key : key) || undefined
    return value.includes(stringify(key)) ? stringify(key) : undefined
  }
  return yield this.context.readProperty(item as Scope, stringify(key))
}

export function join(this: FilterImpl, v: any[], ...args: unknown[]) {
  // an omitted glue is a space, an explicit nil one is empty
  const sep = args.length ? stringify(args[0]) : ' '
  return inputIterator(v)
    .map(item => stringify(item))
    .join(sep)
}
export const last = argumentsToValue(function (this: FilterImpl, v: any) {
  if (v instanceof LiquidRange) return v.last
  return isArrayLike(v) ? readArrayElement(v, -1, this.context.ownPropertyOnly) : undefined
})
export const first = argumentsToValue(function (this: FilterImpl, v: any) {
  if (v instanceof LiquidRange) return v.first
  // a hash answers its first entry as a `[key, value]` pair
  if (isPlainObject(v)) return Object.entries(v)[0]
  return isArrayLike(v) ? readArrayElement(v, 0, this.context.ownPropertyOnly) : undefined
})
export function reverse(this: FilterImpl, v: any[]) {
  return inputIterator(v).reverse()
}

function* sortBy<T>(
  this: FilterImpl,
  arr: T[],
  property: string | undefined,
  comparator: (a: unknown, b: unknown) => number
): IterableIterator<unknown> {
  const values: [T, unknown][] = []
  const array = inputIterator<T>(arr)
  for (const item of array) {
    values.push([item, isNil(toValue(property)) ? item : yield* readProperty.call(this, item, property)])
  }
  return values.sort((lhs, rhs) => comparator(toValue(lhs[1]), toValue(rhs[1]))).map(tuple => tuple[0])
}

export function* sort<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  return yield* sortBy.call(this, arr, property, referenceCompare)
}

export function* sort_natural<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  return yield* sortBy.call(this, arr, property, (a, b) =>
    caseInsensitiveCompare(isNil(a) ? a : stringify(a), isNil(b) ? b : stringify(b))
  )
}

/** The reference's `<=>`: numbers with numbers, strings with strings, nil last; anything else cannot be ordered. */
function referenceCompare(a: unknown, b: unknown): number {
  if (isNil(a) || isNil(b)) return orderedCompare(a, b)
  if (
    ((isNumber(a) || typeof a === 'bigint') && (isNumber(b) || typeof b === 'bigint')) ||
    (isString(a) && isString(b))
  )
    return orderedCompare(a, b)
  assert(a === b, 'cannot sort values of incompatible types')
  return 0
}

export function size(this: FilterImpl, v: any) {
  if (v instanceof FloatDrop) return 0
  v = toValue(v)
  if (isNil(v)) return 0
  if (isString(v)) return [...v].length
  if (isArray(v)) return v.length
  if (v instanceof LiquidRange) return v.length
  if (v instanceof Map || v instanceof Set) return v.size
  if (isObject(v)) return Object.keys(v).length
  // an integer answers its byte size, as in the reference; a float has no size
  if (isNumber(v)) return Number.isInteger(v) ? 8 : 0
  return 0
}

export function* map(this: FilterImpl, arr: Scope[], property: string): IterableIterator<unknown> {
  const results = []
  for (const item of inputIterator(arr)) {
    results.push(yield* readProperty.call(this, item, property))
  }
  return results
}

export function* sum(this: FilterImpl, arr: Scope[], property?: string): IterableIterator<unknown> {
  let sum: unknown = 0
  for (const item of inputIterator(arr)) {
    const raw = isNil(toValue(property)) ? item : yield* readProperty.call(this, item, property)
    const value = toValue(raw)
    sum = plus(
      sum,
      isNumber(value) || isString(value) || typeof value === 'bigint' || raw instanceof FloatDrop ? raw : 0
    )
  }
  return sum
}

export function* compact<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  const array = inputIterator<T>(arr)
  if (isNil(toValue(property))) return array.filter(x => !isNil(toValue(x)))
  const kept: T[] = []
  for (const item of array) {
    if (!isNil(toValue(yield* readProperty.call(this, item, property)))) kept.push(item)
  }
  return kept
}

export function concat<T1, T2>(this: FilterImpl, v: T1[], arg: T2[] = []): (T1 | T2)[] {
  const rhs = toValue(arg)
  assert(isArray(rhs) || rhs instanceof LiquidRange, 'concat filter requires an array argument')
  return [...inputIterator<T1>(v), ...inputIterator<T2>(rhs)]
}

export function slice<T>(this: FilterImpl, v: T[] | string, begin: number, length = 1): T[] | string {
  // a float is sliced as the text it prints, `0.0` rather than `0`
  v = v instanceof FloatDrop ? String(v) : toValue(v)
  assert(!isNil(toValue(begin)), 'invalid integer')
  begin = toStrictInteger(begin)
  length = isNil(toValue(length)) ? 1 : toStrictInteger(length)
  if (isNil(v)) return ''
  // a range is not an array to the reference: it is sliced as the text it prints
  if (v instanceof LiquidRange) v = String(v)
  const wasArray = isArray(v)
  const chars: any[] = wasArray ? (v as any[]) : [...stringify(v)]
  begin = begin < 0 ? chars.length + begin : begin
  if (begin < 0 || length < 0) return wasArray ? [] : ''
  const part = chars.slice(begin, begin + length)
  return wasArray ? (part as T[]) : part.join('')
}

/** Whether an item answers `[]`, as the reference asks: a boolean, nil or float does not, and ends the filter with nil. */
function indexable(item: unknown): boolean {
  const value = toValue(item)
  return !isNil(value) && typeof value !== 'boolean' && !(isNumber(value) && isDecimal(item))
}

function expectedMatcher(this: FilterImpl, expected: any): (v: any) => boolean {
  // as the reference, a nil target selects by truthiness, as an omitted one does
  if (isNil(toValue(expected))) return (v: any) => isTruthy(v, this.context)
  return (v: any) => equals(v, expected)
}

function* filter<T extends object>(
  this: FilterImpl,
  include: boolean,
  arr: T[],
  property: string,
  expected: any
): IterableIterator<unknown> {
  const values: unknown[] = []
  const array = inputIterator<T>(arr)
  for (const item of array) {
    if (!indexable(item)) return undefined
    values.push(yield* readProperty.call(this, item, property))
  }
  const matcher = expectedMatcher.call(this, expected)
  return array.filter((_, i) => matcher(values[i]) === include)
}

export function* where<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected?: any
): IterableIterator<unknown> {
  return yield* filter.call(this, true, arr, property, expected)
}

export function* reject<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected?: any
): IterableIterator<unknown> {
  return yield* filter.call(this, false, arr, property, expected)
}

function* search<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected: string
): IterableIterator<unknown> {
  const array = inputIterator<T>(arr)
  const matcher = expectedMatcher.call(this, expected)
  for (let index = 0; index < array.length; index++) {
    if (!indexable(array[index])) return undefined
    const value = yield* readProperty.call(this, array[index], property)
    if (matcher(value)) return [index, array[index]]
  }
}

export function* has<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected?: any
): IterableIterator<unknown> {
  const result = yield* search.call(this, arr, property, expected)
  return !!result
}

export function* find_index<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected?: any
): IterableIterator<unknown> {
  const result = yield* search.call(this, arr, property, expected)
  return result ? result[0] : undefined
}

export function* find<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected?: any
): IterableIterator<unknown> {
  const result = yield* search.call(this, arr, property, expected)
  return result ? result[1] : undefined
}

export function* uniq<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  const kept: T[] = []
  // primitives dedupe through a Set; only structural keys need the linear scan
  const primitives = new Set<unknown>()
  const structural: unknown[] = []
  for (const item of inputIterator<T>(arr)) {
    const key = toValue(isNil(toValue(property)) ? item : yield* readProperty.call(this, item, property))
    if (isObject(key)) {
      if (structural.some(seen => equals(seen, key))) continue
      structural.push(key)
    } else {
      const primitive = isNumber(key) && Number.isInteger(key) ? BigInt(key) : key
      if (primitives.has(primitive)) continue
      primitives.add(primitive)
    }
    kept.push(item)
  }
  return kept
}

function toStrictInteger(value: any): number {
  return isNil(toValue(value)) ? 0 : Number(toInteger(value))
}
