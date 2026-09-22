import { assert } from './assert'
import { isDecimal } from '../drop/float-drop'
import { toValue } from './underscore'

const U64_MAX = 2n ** 64n - 1n
const RUBY_SPACE = /^[ \t\n\v\f\r]*$/
const PREFIXES: Record<string, [number, RegExp]> = {
  '0x': [16, /[0-9a-f]/i],
  '0b': [2, /[01]/],
  '0o': [8, /[0-7]/],
  '0d': [10, /[0-9]/]
}

/**
 * Ruby's `Integer(string)`: optional surrounding whitespace, a sign, a base
 * prefix, and digits with single underscores between them. A NUL byte ends
 * the string only where Ruby parses a bignum: past 2**64, or with underscores.
 */
export function parseInteger(str: string): number | bigint | undefined {
  let i = /^[ \t\n\v\f\r]*/.exec(str)![0].length
  const negative = str[i] === '-'
  if (str[i] === '-' || str[i] === '+') i++
  let [base, digit] = [10, /[0-9]/]
  const prefix = str.slice(i, i + 2).toLowerCase()
  if (PREFIXES[prefix] && digit.test(str[i + 2] ?? '')) {
    ;[base, digit] = PREFIXES[prefix]
    i += 2
  } else if (str[i] === '0' && /[0-7_]/.test(str[i + 1] ?? '')) {
    ;[base, digit] = [8, /[0-7]/]
    i += 1
  }
  let digits = ''
  let underscored = false
  for (; i < str.length; i++) {
    if (digit.test(str[i])) digits += str[i]
    else if (str[i] === '_' && digits && digit.test(str[i + 1] ?? '')) underscored = true
    else break
  }
  if (!digits) return undefined
  let value = 0n
  for (const d of digits) value = value * BigInt(base) + BigInt(parseInt(d, base))
  let rest = str.slice(i)
  if (underscored || value > U64_MAX) rest = rest.split('\0')[0]
  if (!RUBY_SPACE.test(rest)) return undefined
  if (negative) value = -value
  return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value
}

/** The reference's `Utils.to_integer`: an integer, or a string spelling one; anything else is `invalid integer`. */
export function toInteger(value: unknown): number | bigint {
  assert(!isDecimal(value), 'invalid integer')
  value = toValue(value)
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const parsed = typeof value === 'string' ? parseInteger(value) : undefined
  assert(parsed !== undefined, 'invalid integer')
  return parsed!
}
