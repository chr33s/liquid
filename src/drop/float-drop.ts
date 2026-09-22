import { Drop, hideMembers } from './drop'

const HIDDEN = hideMembers('value', 'toString', 'toJSON')

/**
 * A decimal whose value is whole, like `7.0`. A JavaScript number cannot tell
 * it from the integer `7`, yet it keeps decimal arithmetic and renders `7.0`.
 */
export class FloatDrop extends Drop {
  public constructor(public readonly value: number) {
    super()
  }
  public hiddenMembers(): ReadonlySet<string> {
    return HIDDEN
  }
  public valueOf(): number {
    return this.value
  }
  public toString(): string {
    return formatFloat(this.value)
  }
  public toJSON(): number {
    return this.value
  }
}

/** Whether a value has the decimal kind in arithmetic: a decimal number, or a string spelling one. */
export function isDecimal(value: unknown): boolean {
  if (value instanceof FloatDrop) return true
  if (value instanceof Drop) value = value.valueOf()
  if (typeof value === 'number') return !Number.isInteger(value)
  return typeof value === 'string' && /^[+-]?\d+\.\d+$/.test(value.trim())
}

/** `num` as a value of the given kind. */
export function ofKind(num: number, decimal: boolean): number | FloatDrop {
  return decimal && Number.isInteger(num) ? new FloatDrop(num) : num
}

/**
 * Ruby's `Float#to_s`: the shortest digits, in fixed notation from 1e-4 up to
 * 1e16 (below it only when the digits run past the decimal point), in
 * scientific notation otherwise, and always with a fractional part.
 */
export function formatFloat(num: number): string {
  if (!Number.isFinite(num)) return Number.isNaN(num) ? 'NaN' : num > 0 ? 'Infinity' : '-Infinity'
  if (num === 0) return Object.is(num, -0) ? '-0.0' : '0.0'
  const [mantissa, power] = num.toExponential().split('e')
  const exponent = Number(power)
  const digits = mantissa.replace(/[-.]/g, '').length
  const decpt = exponent + 1
  if ((decpt >= -3 && decpt < 16) || (decpt === 16 && digits > 16)) {
    const fixed = String(num)
    return fixed.includes('.') ? fixed : `${fixed}.0`
  }
  const sign = exponent < 0 ? '-' : '+'
  return `${mantissa.includes('.') ? mantissa : mantissa + '.0'}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`
}
