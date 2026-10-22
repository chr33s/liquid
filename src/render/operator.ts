import { isComparable } from '../drop/comparable'
import { Context } from '../context'
import { toValue } from '../util'
import { isFalsy, isTruthy } from '../render/boolean'
import { isArray, isFunction } from '../util/underscore'

export type OperatorGenerator = Generator<unknown, boolean, any>
export type OperatorResult = boolean | Promise<boolean> | OperatorGenerator
export type UnaryOperatorHandler = (operand: any, ctx: Context) => OperatorResult
export type BinaryOperatorHandler = (lhs: any, rhs: any, ctx: Context) => OperatorResult
export type OperatorHandler = UnaryOperatorHandler | BinaryOperatorHandler
export type Operators = Record<string, OperatorHandler>

function compare(
  direct: 'gt' | 'lt' | 'geq' | 'leq',
  inverse: 'lt' | 'gt' | 'leq' | 'geq',
  fallback: (lhs: any, rhs: any) => boolean
) {
  return function* (lhs: any, rhs: any): OperatorGenerator {
    if (isComparable(lhs)) return yield lhs[direct](rhs)
    if (isComparable(rhs)) return yield rhs[inverse](lhs)
    return fallback(yield toValue(lhs), yield toValue(rhs))
  }
}

export const defaultOperators: Operators = {
  '==': equals,
  '!=': function* (l: any, r: any): OperatorGenerator {
    return !(yield equals(l, r))
  },
  '>': compare('gt', 'lt', (l, r) => l > r),
  '<': compare('lt', 'gt', (l, r) => l < r),
  '>=': compare('geq', 'leq', (l, r) => l >= r),
  '<=': compare('leq', 'geq', (l, r) => l <= r),
  contains: function* (l: any, r: any): OperatorGenerator {
    l = yield toValue(l)
    if (isArray(l)) return yield arrayIncludes(l, r)
    if (isFunction(l?.indexOf)) return l.indexOf(yield toValue(r)) > -1
    return false
  },
  not: function* (v: any, ctx: Context): OperatorGenerator {
    return isFalsy(yield toValue(v), ctx)
  },
  and: function* (l: any, r: any, ctx: Context): OperatorGenerator {
    return isTruthy(yield toValue(l), ctx) && isTruthy(yield toValue(r), ctx)
  },
  or: function* (l: any, r: any, ctx: Context): OperatorGenerator {
    return isTruthy(yield toValue(l), ctx) || isTruthy(yield toValue(r), ctx)
  }
}

export function* equals(lhs: any, rhs: any): OperatorGenerator {
  if (isComparable(lhs)) return yield lhs.equals(rhs)
  if (isComparable(rhs)) return yield rhs.equals(lhs)
  lhs = yield toValue(lhs)
  rhs = yield toValue(rhs)
  if (isArray(lhs)) {
    return isArray(rhs) && (yield arrayEquals(lhs, rhs))
  }
  return lhs === rhs
}

function* arrayEquals(lhs: any[], rhs: any[]): OperatorGenerator {
  if (lhs.length !== rhs.length) return false
  for (let i = 0; i < lhs.length; i++) {
    if (!(yield equals(lhs[i], rhs[i]))) return false
  }
  return true
}

export function* arrayIncludes(arr: any[], item: any): OperatorGenerator {
  for (const value of arr) {
    if (yield equals(value, item)) return true
  }
  return false
}
