import { isComparable } from '../drop/comparable'
import { Context } from '../context'
import { toValue, resolveDrop, LiquidRange } from '../util'
import { isDecimal } from '../drop/float-drop'
import { isTruthy } from '../render/boolean'
import { hasOwnProperty, inspect, isArray, isFunction } from '../util/underscore'

export type OperatorGenerator = Generator<unknown, boolean, any>
export type OperatorResult = boolean | Promise<boolean> | OperatorGenerator
export type UnaryOperatorHandler = (operand: any, ctx: Context) => OperatorResult
export type BinaryOperatorHandler = (lhs: any, rhs: any, ctx: Context) => OperatorResult
export type OperatorHandler = UnaryOperatorHandler | BinaryOperatorHandler
export type Operators = Record<string, OperatorHandler>

function compare(
  direct: 'gt' | 'lt' | 'geq' | 'leq',
  inverse: 'lt' | 'gt' | 'leq' | 'geq',
  test: (lhs: any, rhs: any) => boolean
) {
  return function* (lhs: any, rhs: any): OperatorGenerator {
    if (isComparable(lhs)) return yield lhs[direct](rhs)
    if (isComparable(rhs)) return yield rhs[inverse](lhs)
    lhs = yield resolveDrop(lhs)
    rhs = yield resolveDrop(rhs)
    return ordered(lhs, rhs) && test(toValue(lhs), toValue(rhs))
  }
}

export const defaultOperators: Operators = {
  '==': equals,
  '!=': function* (l: any, r: any): OperatorGenerator {
    return !(yield equals(l, r))
  },
  '<>': function* (l: any, r: any): OperatorGenerator {
    return !(yield equals(l, r))
  },
  '>': compare('gt', 'lt', (l, r) => l > r),
  '<': compare('lt', 'gt', (l, r) => l < r),
  '>=': compare('geq', 'leq', (l, r) => l >= r),
  '<=': compare('leq', 'geq', (l, r) => l <= r),
  contains: function* (l: any, r: any): OperatorGenerator {
    l = toValue(yield resolveDrop(l))
    // the reference never finds nil or false, not even in an array holding one
    const needle = toValue(yield resolveDrop(r))
    if (needle === null || needle === undefined || needle === false) return false
    // a hash contains its keys
    if (isPlainObject(l)) return typeof needle === 'string' && hasOwnProperty.call(l, needle)
    if (l instanceof LiquidRange) return rangeIncludes(l, needle)
    if (isArray(l)) return yield arrayIncludes(l, r)
    if (isFunction(l?.indexOf)) return l.indexOf(needle) > -1
    return false
  },
  and: function* (l: any, r: any, ctx: Context): OperatorGenerator {
    return isTruthy(yield toValue(l), ctx) && isTruthy(yield toValue(r), ctx)
  },
  or: function* (l: any, r: any, ctx: Context): OperatorGenerator {
    return isTruthy(yield toValue(l), ctx) || isTruthy(yield toValue(r), ctx)
  }
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

export function* equals(lhs: any, rhs: any): OperatorGenerator {
  return yield valueEquals(lhs, rhs, new Set())
}

function* valueEquals(lhs: any, rhs: any, comparing: Set<string>): OperatorGenerator {
  if (isComparable(lhs)) return yield lhs.equals(rhs)
  if (isComparable(rhs)) return yield rhs.equals(lhs)
  lhs = yield toValue(lhs)
  rhs = yield toValue(rhs)
  if (lhs === rhs) return true
  if (typeof lhs === 'bigint' && typeof rhs === 'number') return Number.isInteger(rhs) && lhs === BigInt(rhs)
  if (typeof rhs === 'bigint' && typeof lhs === 'number') return Number.isInteger(lhs) && rhs === BigInt(lhs)
  // a nil from the data and a variable that is not defined are both nil
  if ((lhs === null || lhs === undefined) && (rhs === null || rhs === undefined)) return true
  if (lhs instanceof LiquidRange || rhs instanceof LiquidRange) {
    return rangeEquals(lhs, rhs)
  }
  if (isArray(lhs)) {
    return isArray(rhs) && (yield arrayEquals(lhs, rhs, comparing))
  }
  if (isPlainObject(lhs) || isPlainObject(rhs)) {
    return isPlainObject(lhs) && isPlainObject(rhs) && (yield objectEquals(lhs, rhs, comparing))
  }
  return lhs === rhs
}

function isPlainObject(value: any): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

let pairId = 0
const pairIds = new WeakMap<object, number>()

function identify(value: object): number {
  let id = pairIds.get(value)
  if (id === undefined) pairIds.set(value, (id = ++pairId))
  return id
}

function* objectEquals(
  lhs: Record<string, unknown>,
  rhs: Record<string, unknown>,
  comparing: Set<string>
): OperatorGenerator {
  const keys = Object.keys(lhs)
  if (keys.length !== Object.keys(rhs).length) return false
  return yield comparePair(lhs, rhs, comparing, function* () {
    for (const key of keys) {
      if (!hasOwnProperty.call(rhs, key) || !(yield valueEquals(lhs[key], rhs[key], comparing))) return false
    }
    return true
  })
}

/** `comparing` holds the pairs on the current walk, so a self-referential value cannot recurse. */
function* comparePair(
  lhs: object,
  rhs: object,
  comparing: Set<string>,
  compare: () => OperatorGenerator
): OperatorGenerator {
  const pair = `${identify(lhs)},${identify(rhs)}`
  // already on the stack: assume equal and let the rest of the walk decide
  if (comparing.has(pair)) return true
  comparing.add(pair)
  try {
    return yield compare()
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

function* arrayEquals(lhs: any[], rhs: any[], comparing: Set<string>): OperatorGenerator {
  if (lhs.length !== rhs.length) return false
  return yield comparePair(lhs, rhs, comparing, function* () {
    for (let i = 0; i < lhs.length; i++) {
      if (!(yield valueEquals(lhs[i], rhs[i], comparing))) return false
    }
    return true
  })
}

export function* arrayIncludes(arr: any[], item: any): OperatorGenerator {
  for (const value of arr) {
    if (yield equals(value, item)) return true
  }
  return false
}
