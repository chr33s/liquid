import { isComparable } from '../drop/comparable'
import { Context } from '../context'
import { toValue, LiquidRange } from '../util'
import { isDecimal } from '../drop/float-drop'
import { isFalsy, isTruthy } from '../render/boolean'
import { hasOwnProperty, inspect, isArray, isFunction } from '../util/underscore'

export type UnaryOperatorHandler = (operand: any, ctx: Context) => boolean
export type BinaryOperatorHandler = (lhs: any, rhs: any, ctx: Context) => boolean
export type OperatorHandler = UnaryOperatorHandler | BinaryOperatorHandler
export type Operators = Record<string, OperatorHandler>

export const defaultOperators: Operators = {
  '==': equals,
  '!=': (l: any, r: any) => !equals(l, r),
  '<>': (l: any, r: any) => !equals(l, r),
  '>': (l: any, r: any) => {
    if (isComparable(l)) return l.gt(r)
    if (isComparable(r)) return r.lt(l)
    return ordered(l, r) && toValue(l) > toValue(r)
  },
  '<': (l: any, r: any) => {
    if (isComparable(l)) return l.lt(r)
    if (isComparable(r)) return r.gt(l)
    return ordered(l, r) && toValue(l) < toValue(r)
  },
  '>=': (l: any, r: any) => {
    if (isComparable(l)) return l.geq(r)
    if (isComparable(r)) return r.leq(l)
    return ordered(l, r) && toValue(l) >= toValue(r)
  },
  '<=': (l: any, r: any) => {
    if (isComparable(l)) return l.leq(r)
    if (isComparable(r)) return r.geq(l)
    return ordered(l, r) && toValue(l) <= toValue(r)
  },
  contains: (l: any, r: any) => {
    l = toValue(l)
    // the reference never finds nil or false, not even in an array holding one
    const needle = toValue(r)
    if (needle === null || needle === undefined || needle === false) return false
    // a hash contains its keys
    if (isPlainObject(l)) return typeof needle === 'string' && hasOwnProperty.call(l, needle)
    if (l instanceof LiquidRange) return rangeIncludes(l, toValue(r))
    if (isArray(l)) return l.some(i => equals(i, r))
    if (isFunction(l?.indexOf)) return l.indexOf(toValue(r)) > -1
    return false
  },
  and: (l: any, r: any, ctx: Context) => isTruthy(toValue(l), ctx) && isTruthy(toValue(r), ctx),
  or: (l: any, r: any, ctx: Context) => isTruthy(toValue(l), ctx) || isTruthy(toValue(r), ctx)
}

/** The reference's class name for a value `<` can order, if any. */
function orderedType(value: unknown): string | undefined {
  // a string that reads as a decimal is still a string here
  if (typeof toValue(value) !== 'string' && isDecimal(value)) return 'Float'
  value = toValue(value)
  if (typeof value === 'number' || typeof value === 'bigint') return 'Integer'
  if (typeof value === 'string') return 'String'
  if (value instanceof Date) return 'Time'
}

/**
 * Whether two values can be ordered: a value that cannot be ordered, like nil
 * or a boolean, makes the comparison false, while a number against a string
 * is an error, as in the reference.
 */
function ordered(lhs: unknown, rhs: unknown): boolean {
  const l = orderedType(lhs)
  const r = orderedType(rhs)
  if (!l || !r) return false
  const numeric = (type: string) => type === 'Integer' || type === 'Float'
  // a string names the value it met, a number its class, as Ruby's messages do
  if (l !== r && !(numeric(l) && numeric(r))) {
    throw new Error(`comparison of ${l} with ${l === 'String' ? inspect(rhs) : r} failed`)
  }
  return true
}

export function equals(lhs: any, rhs: any): boolean {
  if (isComparable(lhs)) return lhs.equals(rhs)
  if (isComparable(rhs)) return rhs.equals(lhs)
  lhs = toValue(lhs)
  rhs = toValue(rhs)
  if (lhs === rhs) return true
  // a nil from the data and a variable that is not defined are both nil
  if ((lhs === null || lhs === undefined) && (rhs === null || rhs === undefined)) return true
  if (lhs instanceof LiquidRange || rhs instanceof LiquidRange) {
    return rangeEquals(lhs, rhs)
  }
  if (isArray(lhs)) {
    return isArray(rhs) && arrayEquals(lhs, rhs)
  }
  if (isPlainObject(lhs) || isPlainObject(rhs)) {
    return isPlainObject(lhs) && isPlainObject(rhs) && objectEquals(lhs, rhs)
  }
  return lhs === rhs
}

function isPlainObject(value: any): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Pairs already being compared, so a self-referential value cannot recurse. */
const comparing = new Set<string>()
let pairId = 0
const pairIds = new WeakMap<object, number>()

function identify(value: object): number {
  let id = pairIds.get(value)
  if (id === undefined) pairIds.set(value, (id = ++pairId))
  return id
}

function objectEquals(lhs: Record<string, unknown>, rhs: Record<string, unknown>): boolean {
  const keys = Object.keys(lhs)
  if (keys.length !== Object.keys(rhs).length) return false
  const pair = `${identify(lhs)},${identify(rhs)}`
  // already on the stack: assume equal and let the rest of the walk decide
  if (comparing.has(pair)) return true
  comparing.add(pair)
  try {
    return keys.every(key => hasOwnProperty.call(rhs, key) && equals(lhs[key], rhs[key]))
  } finally {
    comparing.delete(pair)
  }
}

function rangeIncludes(range: LiquidRange, item: any): boolean {
  if (typeof item !== 'number' || !Number.isFinite(item)) return false
  const offset = (item - range.begin) / range.step
  return Number.isInteger(offset) && offset >= 0 && offset < range.length
}

/** As the reference's `Range#==`: a range equals only a range with the same bounds, never an array. */
function rangeEquals(lhs: any, rhs: any): boolean {
  if (!(lhs instanceof LiquidRange && rhs instanceof LiquidRange)) return false
  return lhs.first === rhs.first && lhs.last === rhs.last
}

function arrayEquals(lhs: any[], rhs: any[]): boolean {
  if (lhs.length !== rhs.length) return false
  return !lhs.some((value, i) => !equals(value, rhs[i]))
}

export function arrayIncludes(arr: any[], item: any): boolean {
  return arr.some(value => equals(value, item))
}
