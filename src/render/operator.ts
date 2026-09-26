import { isComparable } from '../drop/comparable'
import { Context } from '../context'
import { toValue } from '../util'
import { isFalsy, isTruthy } from '../render/boolean'
import { isArray, isFunction } from '../util/underscore'

export type UnaryOperatorHandler = (operand: any, ctx: Context) => boolean
export type BinaryOperatorHandler = (lhs: any, rhs: any, ctx: Context) => boolean
export type OperatorHandler = UnaryOperatorHandler | BinaryOperatorHandler
export type Operators = Record<string, OperatorHandler>

function compare(
  direct: 'gt' | 'lt' | 'geq' | 'leq',
  inverse: 'lt' | 'gt' | 'leq' | 'geq',
  fallback: (lhs: any, rhs: any) => boolean
) {
  return (lhs: any, rhs: any) => {
    if (isComparable(lhs)) return lhs[direct](rhs)
    if (isComparable(rhs)) return rhs[inverse](lhs)
    return fallback(toValue(lhs), toValue(rhs))
  }
}

export const defaultOperators: Operators = {
  '==': equals,
  '!=': (l: any, r: any) => !equals(l, r),
  '>': compare('gt', 'lt', (l, r) => l > r),
  '<': compare('lt', 'gt', (l, r) => l < r),
  '>=': compare('geq', 'leq', (l, r) => l >= r),
  '<=': compare('leq', 'geq', (l, r) => l <= r),
  contains: (l: any, r: any) => {
    l = toValue(l)
    if (isArray(l)) return l.some(i => equals(i, r))
    if (isFunction(l?.indexOf)) return l.indexOf(toValue(r)) > -1
    return false
  },
  not: (v: any, ctx: Context) => isFalsy(toValue(v), ctx),
  and: (l: any, r: any, ctx: Context) => isTruthy(toValue(l), ctx) && isTruthy(toValue(r), ctx),
  or: (l: any, r: any, ctx: Context) => isTruthy(toValue(l), ctx) || isTruthy(toValue(r), ctx)
}

export function equals(lhs: any, rhs: any): boolean {
  if (isComparable(lhs)) return lhs.equals(rhs)
  if (isComparable(rhs)) return rhs.equals(lhs)
  lhs = toValue(lhs)
  rhs = toValue(rhs)
  if (isArray(lhs)) {
    return isArray(rhs) && arrayEquals(lhs, rhs)
  }
  return lhs === rhs
}

function arrayEquals(lhs: any[], rhs: any[]): boolean {
  if (lhs.length !== rhs.length) return false
  return !lhs.some((value, i) => !equals(value, rhs[i]))
}

export function arrayIncludes(arr: any[], item: any): boolean {
  return arr.some(value => equals(value, item))
}
