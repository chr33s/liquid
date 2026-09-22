import { Drop } from '../drop/drop'
import { FloatDrop, formatFloat } from '../drop/float-drop'
import { LiquidRange } from './sequence'

export const toString = Object.prototype.toString
export const hasOwnProperty = Object.prototype.hasOwnProperty
const toLowerCase = String.prototype.toLowerCase

export function isString(value: any): value is string {
  return typeof value === 'string'
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function isFunction(value: any): value is Function {
  return typeof value === 'function'
}

export function isPromise<T>(val: any): val is Promise<T> {
  return val && isFunction(val.then)
}

export function isIterator(val: any): val is IterableIterator<any> {
  return val && isFunction(val.next) && isFunction(val.throw) && isFunction(val.return)
}

export function promisify<T1, T2>(
  fn: (arg1: T1, cb: (err: Error | null, result: T2) => void) => void
): (arg1: T1) => Promise<T2>
export function promisify<T1, T2, T3>(
  fn: (arg1: T1, arg2: T2, cb: (err: Error | null, result: T3) => void) => void
): (arg1: T1, arg2: T2) => Promise<T3>
export function promisify(fn: any) {
  return function (...args: any[]) {
    return new Promise((resolve, reject) => {
      fn(...args, (err: Error, result: any) => {
        err ? reject(err) : resolve(result)
      })
    })
  }
}

/**
 * A value as text, the way the reference's `Utils.to_s` reads a filter's
 * input: nil is empty, and an array or hash prints as Ruby's `inspect`.
 */
export function stringify(value: any): string {
  if (value instanceof FloatDrop) return value.toString()
  value = toValue(value)
  if (isString(value)) return value
  if (isNil(value)) return ''
  if (isNumber(value)) return formatNumber(value)
  if (isArray(value) || isPlainObject(value)) return inspect(value)
  return String(value)
}

/** A value as output renders it: like `stringify`, except that an array renders its items one after another. */
export function stringifyOutput(value: any): string {
  const resolved = value instanceof FloatDrop ? value : toValue(value)
  if (isArray(resolved)) return resolved.map(stringifyOutput).join('')
  return stringify(value)
}

/** Ruby's `inspect` of a value, as the reference prints an array or hash. */
export function inspect(value: any, seen = new Set<object>()): string {
  if (value instanceof FloatDrop) return value.toString()
  value = toValue(value)
  if (isNil(value)) return 'nil'
  if (isString(value)) return inspectString(value)
  if (isNumber(value)) return formatNumber(value)
  if (isArray(value) || isPlainObject(value)) {
    if (seen.has(value)) return isArray(value) ? '[...]' : '{...}'
    seen.add(value)
    try {
      if (isArray(value)) return `[${value.map(item => inspect(item, seen)).join(', ')}]`
      const entries = Object.entries(value).map(([key, item]) => `${inspectString(key)}=>${inspect(item, seen)}`)
      return `{${entries.join(', ')}}`
    } finally {
      seen.delete(value)
    }
  }
  return String(value)
}

const RUBY_ESCAPES: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\t': '\\t',
  '\r': '\\r',
  '\f': '\\f',
  '\v': '\\v',
  '\b': '\\b',
  '\x07': '\\a',
  '\x1b': '\\e'
}

function inspectString(str: string): string {
  let body = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    const code = c.charCodeAt(0)
    if (RUBY_ESCAPES[c] !== undefined) body += RUBY_ESCAPES[c]
    else if (code < 0x20 || code === 0x7f) body += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`
    else if (c === '#' && '{$@'.includes(str[i + 1])) body += '\\#'
    else body += c
  }
  return `"${body}"`
}

/** Ruby's `Integer#to_s` and `Float#to_s`: a float far from one prints as `1.0e-05`. */
export function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return Number.isNaN(num) ? 'NaN' : num > 0 ? 'Infinity' : '-Infinity'
  if (Number.isInteger(num)) return Math.abs(num) < 1e21 ? String(num) : BigInt(num).toString()
  return formatFloat(num)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function readArrayElement(arr: any[], index: number, ownPropertyOnly: boolean) {
  if (index < 0) index = arr.length + index
  if (ownPropertyOnly && !hasOwnProperty.call(arr, index)) return undefined
  return arr[index]
}

export function toEnumerable<T = unknown>(val: any): T[] {
  val = toValue(val)
  if (isArray(val)) return val
  if (val instanceof LiquidRange) return val.toArray() as unknown as T[]
  if (isString(val) && val.length > 0) return [val] as unknown as T[]
  if (isIterable(val)) return Array.from(val)
  if (isObject(val)) return Object.entries(val) as unknown as T[]
  return []
}

export function toArray(val: any) {
  val = toValue(val)
  if (isNil(val)) return []
  if (isArray(val)) return val
  if (val instanceof LiquidRange) return val.toArray()
  return [val]
}

export function toValue(value: any): any {
  return value instanceof Drop && isFunction(value.valueOf) ? value.valueOf() : value
}

export function toNumber(value: any): number {
  value = toValue(value)
  if (isNumber(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (isString(value)) {
    const str = value.trim()
    // a full decimal is read as a decimal; anything else keeps its integer prefix
    if (/^[+-]?\d+\.\d+$/.test(str)) return Number(str)
    // Ruby's `to_i`: the integer prefix, underscores between digits allowed
    const prefix = /^[+-]?\d+(?:_\d+)*/.exec(str)
    return prefix ? parseInt(prefix[0].replace(/_/g, ''), 10) : 0
  }
  // as the reference's `Utils.to_number`, anything else is 0
  return 0
}

export function isNumber(value: any): value is number {
  return typeof value === 'number'
}

export function toLiquid(value: any): any {
  if (value && isFunction(value.toLiquid)) return toLiquid(value.toLiquid())
  return value
}

export function isNil(value: any): boolean {
  return value == null
}

export function isUndefined(value: any): boolean {
  return value === undefined
}

export function isArray(value: any): value is any[] {
  return Array.isArray(value)
}

export function isArrayLike(value: any): value is any[] {
  return value && isNumber(value.length)
}

export function isIterable(value: any): value is Iterable<any> {
  return isObject(value) && Symbol.iterator in value
}

/*
 * Iterates over own enumerable string keyed properties of an object and invokes iteratee for each property.
 * The iteratee is invoked with three arguments: (value, key, object).
 * Iteratee functions may exit iteration early by explicitly returning false.
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @return {Object} Returns object.
 */
export function forOwn<T>(
  obj: Record<string, T> | undefined,
  iteratee: (val: T, key: string, obj: { [key: string]: T }) => boolean | void
) {
  obj = obj || {}
  for (const k in obj) {
    if (hasOwnProperty.call(obj, k)) {
      if (iteratee(obj[k], k, obj) === false) break
    }
  }
  return obj
}

export function last<T>(arr: T[]): T
export function last(arr: string): string
export function last(arr: any[] | string): any | string {
  return arr[arr.length - 1]
}

/*
 * Checks if value is the language type of Object.
 * (e.g. arrays, functions, objects, regexes, new Number(0), and new String(''))
 * @param {any} value The value to check.
 * @return {Boolean} Returns true if value is an object, else false.
 */
export function isObject(value: any): value is object {
  const type = typeof value
  return value !== null && (type === 'object' || type === 'function')
}

export function range(start: number, stop: number, step = 1) {
  const arr: number[] = []
  for (let i = start; i < stop; i += step) {
    arr.push(i)
  }
  return arr
}

export function padStart(str: any, length: number, ch = ' ') {
  return pad(str, length, ch, (str, ch) => ch + str)
}

export function padEnd(str: any, length: number, ch = ' ') {
  return pad(str, length, ch, (str, ch) => str + ch)
}

export function pad(str: any, length: number, ch: string, add: (str: string, ch: string) => string) {
  str = String(str)
  const n = length - str.length
  if (n <= 0) return str
  return add(str, ch.repeat(n))
}

export function identify<T>(val: T): T {
  return val
}

export function changeCase(str: string): string {
  const hasLowerCase = [...str].some(ch => ch >= 'a' && ch <= 'z')
  return hasLowerCase ? str.toUpperCase() : str.toLowerCase()
}

export function ellipsis(str: string, N: number): string {
  return str.length > N ? str.slice(0, N - 3) + '...' : str
}

export function orderedCompare(a: any, b: any) {
  if (isNil(a) && isNil(b)) return 0
  if (isNil(a)) return 1
  if (isNil(b)) return -1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// compare string in case-insensitive way, undefined values to the tail
export function caseInsensitiveCompare(a: any, b: any) {
  if (isNil(a) && isNil(b)) return 0
  if (isNil(a)) return 1
  if (isNil(b)) return -1
  a = toLowerCase.call(a)
  b = toLowerCase.call(b)
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function argumentsToValue<F extends (...args: any) => any, T>(fn: F) {
  return function (this: T, ...args: Parameters<F>) {
    return fn.call(this, ...args.map(toValue))
  }
}

export function argumentsToNumber<F extends (...args: any) => any, T>(fn: F) {
  return function (this: T, ...args: Parameters<F>) {
    return fn.call(this, ...args.map(toNumber))
  }
}

export function escapeRegExp(text: string) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

/** Return an array containing unique elements from _array_. Works with nested arrays and objects. */
export function* strictUniq<T>(array: Array<T>): Generator<T> {
  const seen = new Set()

  for (const element of array) {
    const key = JSON.stringify(element)
    if (!seen.has(key)) {
      seen.add(key)
      yield element
    }
  }
}
