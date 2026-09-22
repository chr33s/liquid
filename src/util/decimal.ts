/**
 * Exact decimal arithmetic on the shortest spelling of a number, as the
 * reference computes with a float operand (Ruby's `BigDecimal`), so that
 * `2.5 | times: 2.9` is 7.25 rather than 7.249999999999999.
 */
interface Decimal {
  /** value = digits / 10^scale */
  digits: bigint
  scale: number
}

/** Significant digits a quotient carries before it is read back as a number. */
const QUOTIENT_DIGITS = 40

function toDecimal(num: number): Decimal {
  const [mantissa, exponent = '0'] = String(num).toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const scale = fraction.length - Number(exponent)
  const digits = BigInt(whole + fraction)
  return scale >= 0 ? { digits, scale } : { digits: digits * 10n ** BigInt(-scale), scale: 0 }
}

function fromDecimal({ digits, scale }: Decimal): number {
  return Number(`${digits}e${-scale}`)
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale)
  return [a.digits * 10n ** BigInt(scale - a.scale), b.digits * 10n ** BigInt(scale - b.scale), scale]
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q
}

export function decimalAdd(a: number, b: number): number {
  const [x, y, scale] = align(toDecimal(a), toDecimal(b))
  return fromDecimal({ digits: x + y, scale })
}

export function decimalSubtract(a: number, b: number): number {
  const [x, y, scale] = align(toDecimal(a), toDecimal(b))
  return fromDecimal({ digits: x - y, scale })
}

export function decimalMultiply(a: number, b: number): number {
  const x = toDecimal(a)
  const y = toDecimal(b)
  return fromDecimal({ digits: x.digits * y.digits, scale: x.scale + y.scale })
}

/** The quotient of two finite numbers, `b` not zero. */
export function decimalDivide(a: number, b: number): number {
  const [x, y] = align(toDecimal(a), toDecimal(b))
  const numeratorDigits = (x < 0n ? -x : x).toString().length
  const denominatorDigits = (y < 0n ? -y : y).toString().length
  const scale = Math.max(0, QUOTIENT_DIGITS + denominatorDigits - numeratorDigits)
  return fromDecimal({ digits: (x * 10n ** BigInt(scale)) / y, scale })
}

/** The modulo taking the sign of the divisor, `b` not zero. */
export function decimalModulo(a: number, b: number): number {
  const [x, y, scale] = align(toDecimal(a), toDecimal(b))
  return fromDecimal({ digits: x - y * floorDiv(x, y), scale })
}
