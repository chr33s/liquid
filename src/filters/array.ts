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
  readArrayElement,
  toEnumerable
} from '../util'
import { arrayIncludes, equals, evalToken, isTruthy } from '../render'
import { Value, FilterImpl } from '../template'
import { Tokenizer } from '../parser'
import type { Scope } from '../context'
import { EmptyDrop } from '../drop'

export const join = argumentsToValue(function (this: FilterImpl, v: any[], arg: string) {
  const array = toArray(v)
  const sep = isNil(arg) ? ' ' : stringify(arg)
  return Array.prototype.join.call(array, sep)
})
export const last = argumentsToValue(function (this: FilterImpl, v: any) {
  return isArrayLike(v) ? readArrayElement(v, -1, this.context.ownPropertyOnly) : ''
})
export const first = argumentsToValue(function (this: FilterImpl, v: any) {
  return isArrayLike(v) ? readArrayElement(v, 0, this.context.ownPropertyOnly) : ''
})
export const reverse = argumentsToValue(function (this: FilterImpl, v: any[]) {
  const array = toArray(v)
  return [...array].reverse()
})

function* sortBy<T>(
  this: FilterImpl,
  arr: T[],
  property: string | undefined,
  comparator: (a: unknown, b: unknown) => number
): IterableIterator<unknown> {
  const values: [T, unknown][] = []
  const array = toArray(arr)
  for (const item of array) {
    values.push([item, property ? yield this.context._getFromScope(item, stringify(property).split('.'), false) : item])
  }
  return values.sort((lhs, rhs) => comparator(lhs[1], rhs[1])).map(tuple => tuple[0])
}

export function* sort<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  return yield* sortBy.call(this, arr, property, orderedCompare)
}

export function* sort_natural<T>(this: FilterImpl, arr: T[], property?: string): IterableIterator<unknown> {
  return yield* sortBy.call(this, arr, property, caseInsensitiveCompare)
}

export const size = (v: string | any[]) => v?.length || 0

export function* map(this: FilterImpl, arr: Scope[], property: string): IterableIterator<unknown> {
  const results = []
  const array = toArray(arr)
  for (const item of array) {
    results.push(yield this.context._getFromScope(item, stringify(property), false))
  }
  return results
}

export function* sum(this: FilterImpl, arr: Scope[], property?: string): IterableIterator<unknown> {
  let sum = 0
  const array = toArray(arr)
  for (const item of array) {
    const data = Number(property ? yield this.context._getFromScope(item, stringify(property), false) : item)
    sum += Number.isNaN(data) ? 0 : data
  }
  return sum
}

export function compact<T>(this: FilterImpl, arr: T[]) {
  const array = toArray(arr)
  return Array.prototype.filter.call(array, x => !isNil(toValue(x)))
}

export function concat<T1, T2>(this: FilterImpl, v: T1[], arg: T2[] = []): (T1 | T2)[] {
  const lhs = toArray(v)
  const rhs = toArray(arg)
  return Array.prototype.concat.call(lhs, rhs)
}

export function push<T>(this: FilterImpl, v: T[], arg: T): T[] {
  return concat.call(this, v, [arg]) as T[]
}

export function unshift<T>(this: FilterImpl, v: T[], arg: T): T[] {
  const array = toArray(v)
  const clone = [...array]
  clone.unshift(arg)
  return clone
}

export function pop<T>(this: FilterImpl, v: T[]): T[] {
  const array = toArray(v)
  const clone = [...array]
  clone.pop()
  return clone
}

export function shift<T>(this: FilterImpl, v: T[]): T[] {
  const array = toArray(v)
  const clone = [...array]
  clone.shift()
  return clone
}

export function slice<T>(this: FilterImpl, v: T[] | string, begin: number, length = 1): T[] | string {
  v = toValue(v)
  if (isNil(v)) return []
  if (!isArray(v)) v = stringify(v)
  begin = begin < 0 ? v.length + begin : begin
  if (begin < 0 || length < 0) return isArray(v) ? [] : ''
  return isArray(v)
    ? Array.prototype.slice.call(v, begin, begin + length)
    : String.prototype.slice.call(v, begin, begin + length)
}

interface ItemQuery {
  property?: string
  itemName?: string
  exp?: string
}

function expectedMatcher(this: FilterImpl, expected: any): (v: any) => boolean {
  if (this.context.opts.jekyllWhere) {
    return (v: any) =>
      EmptyDrop.is(expected) ? equals(v, expected) : isArray(v) ? arrayIncludes(v, expected) : equals(v, expected)
  }
  if (expected === undefined) return (v: any) => isTruthy(v, this.context)
  return (v: any) => equals(v, expected)
}

function* project(
  this: FilterImpl,
  items: Iterable<unknown>,
  query: ItemQuery,
  until?: (value: unknown) => boolean
): Generator<unknown, unknown[], unknown> {
  const values: unknown[] = []
  const token = query.property != null ? new Tokenizer(stringify(query.property)).readScopeValue() : undefined
  const expression = query.exp != null ? new Value(stringify(query.exp), this.liquid) : undefined
  for (const item of items) {
    let value: unknown
    if (expression) {
      this.context.push({ [query.itemName!]: item })
      try {
        value = yield expression.value(this.context)
      } finally {
        this.context.pop()
      }
    } else {
      value = yield evalToken(token, this.context.spawn(item as object))
    }
    values.push(value)
    if (until?.(value)) break
  }
  return values
}

function* filter<T extends object>(
  this: FilterImpl,
  include: boolean,
  arr: T[],
  property: string,
  expected: any
): IterableIterator<unknown> {
  const items = toArray(arr)
  const values = (yield* project.call(this, items, { property })) as unknown[]
  const matcher = expectedMatcher.call(this, expected)
  return items.filter((_, index) => matcher(values[index]) === include)
}

function* filter_exp<T extends object>(
  this: FilterImpl,
  include: boolean,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const items = toArray(arr)
  const values = (yield* project.call(this, items, { itemName, exp })) as unknown[]
  return items.filter((_, index) => isTruthy(values[index], this.context) === include)
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

export function* where_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  return yield* filter_exp.call(this, true, arr, itemName, exp)
}

export function* reject_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  return yield* filter_exp.call(this, false, arr, itemName, exp)
}

function grouped(items: unknown[], keys: unknown[]) {
  const map = new Map<unknown, unknown[]>()
  items.forEach((item, index) => {
    const key = keys[index]
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  })
  return [...map.entries()].map(([name, groupedItems]) => ({ name, items: groupedItems }))
}

export function* group_by<T extends object>(this: FilterImpl, arr: T[], property: string): IterableIterator<unknown> {
  const items = toEnumerable(arr)
  const keys = (yield* project.call(this, items, { property })) as unknown[]
  return grouped(items, keys)
}

export function* group_by_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const items = toEnumerable(arr)
  const keys = (yield* project.call(this, items, { itemName, exp })) as unknown[]
  return grouped(items, keys)
}

function firstHit(values: unknown[], matched: boolean): number {
  return matched ? values.length - 1 : -1
}

function* search<T extends object>(
  this: FilterImpl,
  arr: T[],
  property: string,
  expected: string
): IterableIterator<unknown> {
  const items = toArray(arr)
  const matcher = expectedMatcher.call(this, expected)
  const values = (yield* project.call(this, items, { property }, value => matcher(value))) as unknown[]
  const index = firstHit(values, values.length > 0 && matcher(values[values.length - 1]))
  if (index >= 0) return [index, items[index]]
}

function* search_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const items = toArray(arr)
  const values = (yield* project.call(this, items, { itemName, exp }, value =>
    isTruthy(value, this.context)
  )) as unknown[]
  const index = firstHit(values, values.length > 0 && isTruthy(values[values.length - 1], this.context))
  if (index >= 0) return [index, items[index]]
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

export function* has_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const result = yield* search_exp.call(this, arr, itemName, exp)
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

export function* find_index_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const result = yield* search_exp.call(this, arr, itemName, exp)
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

export function* find_exp<T extends object>(
  this: FilterImpl,
  arr: T[],
  itemName: string,
  exp: string
): IterableIterator<unknown> {
  const result = yield* search_exp.call(this, arr, itemName, exp)
  return result ? result[1] : undefined
}

export function uniq<T>(this: FilterImpl, arr: T[]): T[] {
  arr = toArray(arr)
  return [...new Set(arr)]
}

export function sample<T>(this: FilterImpl, v: T[] | string, count = 1): T | string | (T | string)[] {
  v = toValue(v)
  if (isNil(v)) return []
  if (!isArray(v)) v = stringify(v)
  const shuffled = [...v].sort(() => Math.random() - 0.5)
  if (count === 1) return shuffled[0]
  return shuffled.slice(0, count)
}
