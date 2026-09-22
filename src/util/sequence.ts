import { assert } from './assert'
import { isArray, isIterable, isNil, isString, toEnumerable, toValue } from './underscore'
import { FloatDrop } from '../drop/float-drop'
import { Drop } from '../drop/drop'
import { toInteger } from './integer'

const MAX_MATERIALIZED_LENGTH = 1e7

/**
 * A lazily evaluated arithmetic sequence, as produced by `(1..5)`.
 *
 * Slicing, reversing and length queries are O(1); elements are only produced
 * when iterated, so `{% for i in (1..100000000) limit: 3 %}` costs three items.
 */
export class LiquidRange {
  public readonly begin: number
  public readonly length: number
  public readonly step: number

  public constructor(begin: number, length: number, step = 1) {
    this.begin = begin
    this.length = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : length > 0 ? Number.MAX_SAFE_INTEGER : 0
    this.step = step
  }

  public static fromBounds(low: number, high: number): LiquidRange {
    if (Number.isNaN(low) || Number.isNaN(high)) return new LiquidRange(0, 0)
    const range = new LiquidRange(low, Math.ceil(high + 1 - low))
    range.bounds = [low, high]
    return range
  }
  /** The bounds a `(low..high)` literal was written with, which an empty range cannot recover. */
  private bounds?: [number, number]
  /** The low bound, as the reference's `Range#first`, even of an empty range. */
  public get first() {
    return this.bounds ? this.bounds[0] : this.begin
  }
  /** The high bound, as the reference's `Range#last`, even of an empty range. */
  public get last() {
    return this.bounds ? this.bounds[1] : this.begin + (this.length - 1) * this.step
  }

  public at(index: number): number | undefined {
    if (index < 0) index += this.length
    if (index < 0 || index >= this.length) return undefined
    return this.begin + index * this.step
  }

  public slice(begin = 0, end = this.length): LiquidRange {
    const start = clampIndex(begin, this.length)
    const stop = clampIndex(end, this.length)
    return new LiquidRange(this.begin + start * this.step, Math.max(0, stop - start), this.step)
  }

  public reverse(): LiquidRange {
    if (this.length === 0) return this
    return new LiquidRange(this.begin + (this.length - 1) * this.step, this.length, -this.step)
  }

  public *[Symbol.iterator](): IterableIterator<number> {
    const { begin, length, step } = this
    for (let i = 0; i < length; i++) yield begin + i * step
  }

  public toArray(): number[] {
    assert(this.length <= MAX_MATERIALIZED_LENGTH, 'range length limit exceeded')
    return [...this]
  }

  /** A range prints as its bounds, `1..5`. */
  public toString(): string {
    return `${this.first}..${this.last}`
  }
}

export type Sequence<T = unknown> = T[] | LiquidRange

export function isSequence(value: any): value is Sequence {
  return isArray(value) || value instanceof LiquidRange
}

export function seqAt<T>(seq: Sequence<T>, index: number): T | undefined {
  return (seq instanceof LiquidRange ? seq.at(index) : seq[index]) as T | undefined
}

export function seqReverse<T>(seq: Sequence<T>): Sequence<T> {
  return seq instanceof LiquidRange ? seq.reverse() : [...seq].reverse()
}

function clampIndex(index: number, length: number): number {
  index = Math.trunc(Number(index))
  if (Number.isNaN(index)) return 0
  if (index < 0) index += length
  return Math.min(Math.max(index, 0), length)
}

export function toSequence(val: any): Sequence {
  if (val instanceof LiquidRange) return val
  return toEnumerable(val)
}

/** A loop argument as the reference reads it: nil is 0, anything else must be an integer or spell one. */
export function toIntegerArgument(value: unknown): number {
  if (isNil(toValue(value))) return 0
  return Number(toInteger(value))
}

/**
 * The items from index `from` up to, not including, `to`, as the reference's
 * loops select them: a negative `from` starts at the first item, and `to` is
 * counted from the unclamped `from`.
 */
export function sliceSequence(seq: Sequence, from: number, to?: number): Sequence {
  const start = Math.max(from, 0)
  const end = to === undefined ? seq.length : Math.min(Math.max(to, 0), seq.length)
  return end <= start ? seq.slice(0, 0) : seq.slice(start, end)
}

/** Ruby's `to_i` of a loop attribute: nil is 0, a string reads its integer prefix. */
export function toLooseInteger(value: unknown): number {
  value = toValue(value)
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return Math.trunc(value)
  if (typeof value === 'string') return Math.trunc(Number(/^\s*[+-]?\d+/.exec(value)?.[0] ?? 0))
  assert(false, 'invalid integer')
  return 0
}

export function offsetSequence(seq: Sequence, count: unknown): Sequence {
  return seq.slice(Math.max(0, toIntegerArgument(count)))
}

export function limitSequence(seq: Sequence, count: unknown): Sequence {
  const limit = toIntegerArgument(count)
  return limit <= 0 ? seq.slice(0, 0) : seq.slice(0, limit)
}

/**
 * Reference input normalization: an array is flattened, a hash or scalar is
 * wrapped, nil becomes empty. Only the filters that use it in the reference
 * engine flatten nested arrays.
 */
export function inputIterator<T = any>(v: any): T[] {
  if (v instanceof FloatDrop) return [v] as unknown as T[]
  const drop = v
  v = toValue(v)
  if (isNil(v)) return []
  // a drop that is not a collection is one item, still a drop
  if (drop instanceof Drop && !isArray(v) && !(v instanceof LiquidRange) && (isString(v) || !isIterable(v))) {
    return [drop] as unknown as T[]
  }
  if (isArray(v)) return v.flat(Infinity) as T[]
  if (v instanceof LiquidRange) return v.toArray() as unknown as T[]
  if (isNil(v)) return []
  if (isString(v)) return [v] as unknown as T[]
  if (isIterable(v)) return [...v] as T[]
  return [v]
}
