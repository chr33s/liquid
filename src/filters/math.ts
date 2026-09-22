import { assert, toNumber, toValue } from '../util'
import { isDecimal, ofKind } from '../drop/float-drop'
import {
  decimalAdd,
  decimalDivide,
  decimalModulo,
  decimalMultiply,
  decimalRound,
  decimalSubtract
} from '../util/decimal'

export function ceil(v: unknown) {
  return isBig(v) ? toValue(v) : Math.ceil(integral(toNumber(v)))
}

export function floor(v: unknown) {
  return isBig(v) ? toValue(v) : Math.floor(integral(toNumber(v)))
}

/** A number that becomes an integer must be finite, as the reference's `to_i` requires. */
function integral(value: number): number {
  if (Number.isNaN(value)) throw new Error("Computation results in 'NaN' (Not a Number)")
  if (!Number.isFinite(value)) throw new Error(`Computation results in '${value < 0 ? '-' : ''}Infinity'`)
  return value
}

export function abs(v: unknown) {
  const big = toValue(v)
  if (typeof big === 'bigint') return big < 0n ? -big : big
  return ofKind(Math.abs(toNumber(v)), isDecimal(v))
}

export function at_least(v: unknown, arg: unknown) {
  return compare(arg, v) > 0 ? numeric(arg) : numeric(v)
}

export function at_most(v: unknown, arg: unknown) {
  return compare(arg, v) < 0 ? numeric(arg) : numeric(v)
}

export function plus(v: unknown, arg: unknown) {
  return arithmetic(
    v,
    arg,
    (lhs, rhs) => lhs + rhs,
    decimalAdd,
    (lhs, rhs) => lhs + rhs
  )
}

export function minus(v: unknown, arg: unknown) {
  return arithmetic(
    v,
    arg,
    (lhs, rhs) => lhs - rhs,
    decimalSubtract,
    (lhs, rhs) => lhs - rhs
  )
}

export function times(v: unknown, arg: unknown) {
  return arithmetic(
    v,
    arg,
    (lhs, rhs) => lhs * rhs,
    decimalMultiply,
    (lhs, rhs) => lhs * rhs
  )
}

export function divided_by(dividend: unknown, divisor: unknown) {
  const lhs = toNumber(dividend)
  const rhs = toNumber(divisor)
  const decimal = isDecimal(dividend) || isDecimal(divisor)
  // integer division by zero raises; once either side is a decimal the
  // reference follows IEEE 754 and yields Infinity or NaN
  assert(rhs !== 0 || decimal, 'divided by 0')
  if (!decimal && (isBig(dividend) || isBig(divisor))) {
    const [a, b] = [toBig(dividend), toBig(divisor)]
    const q = a / b
    return fromBig(a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q)
  }
  if (!decimal) return Math.floor(lhs / rhs)
  return ofKind(rhs === 0 || !isFinite(lhs) || !isFinite(rhs) ? lhs / rhs : decimalDivide(lhs, rhs), true)
}

export function modulo(v: unknown, arg: unknown) {
  const lhs = toNumber(v)
  const rhs = toNumber(arg)
  // unlike division, the reference raises for a zero divisor whatever kind the
  // operands are; the result is floored, so it takes the divisor's sign
  assert(rhs !== 0, 'divided by 0')
  const decimal = isDecimal(v) || isDecimal(arg)
  if (decimal && isFinite(lhs) && isFinite(rhs)) return ofKind(decimalModulo(lhs, rhs), true)
  if (!decimal && (isBig(v) || isBig(arg))) {
    const [a, b] = [toBig(v), toBig(arg)]
    return fromBig(((a % b) + b) % b)
  }
  return ofKind(((lhs % rhs) + rhs) % rhs, decimal)
}

export function round(v: unknown, arg: unknown = 0) {
  const digits = Math.trunc(integral(toNumber(arg)))
  const value = isBig(v) ? (toValue(v) as bigint) : toNumber(v)
  if (typeof value === 'number' && !Number.isFinite(value)) return digits > 0 ? value : integral(value)
  const result = decimalRound(value, digits)
  return typeof result === 'bigint' ? fromBig(result) : ofKind(result, digits > 0 && isDecimal(v))
}

/**
 * A result is a decimal when either operand is, and is then computed exactly
 * on the operands' decimal spelling; an integer result past 2**53 is a BigInt,
 * as the reference's integers have no bound.
 */
function arithmetic(
  lhs: unknown,
  rhs: unknown,
  operation: (lhs: number, rhs: number) => number,
  exact: (lhs: number, rhs: number) => number,
  big: (lhs: bigint, rhs: bigint) => bigint
) {
  const [l, r] = [toNumber(lhs), toNumber(rhs)]
  const decimal = isDecimal(lhs) || isDecimal(rhs)
  if (decimal) return ofKind(isFinite(l) && isFinite(r) ? exact(l, r) : operation(l, r), true)
  const result = operation(l, r)
  if (!isBig(lhs) && !isBig(rhs) && Number.isSafeInteger(result)) return result
  return fromBig(big(toBig(lhs), toBig(rhs)))
}

function numeric(value: unknown) {
  return isBig(value) ? toValue(value) : ofKind(toNumber(value), isDecimal(value))
}

function compare(lhs: unknown, rhs: unknown): number {
  if (isBig(lhs) || isBig(rhs)) {
    if (isDecimal(lhs) || isDecimal(rhs)) return toNumber(lhs) - toNumber(rhs)
    const [a, b] = [toBig(lhs), toBig(rhs)]
    return a === b ? 0 : a > b ? 1 : -1
  }
  return toNumber(lhs) - toNumber(rhs)
}

function isBig(value: unknown): boolean {
  return typeof toValue(value) === 'bigint'
}

function toBig(value: unknown): bigint {
  const resolved = toValue(value)
  return typeof resolved === 'bigint' ? resolved : BigInt(Math.trunc(toNumber(resolved)))
}

function fromBig(value: bigint): number | bigint {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value
}
