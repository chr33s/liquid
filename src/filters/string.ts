/**
 * String related filters
 *
 * * prefer stringify() to String() since `undefined`, `null` should eval ''
 */

import { FilterImpl } from '../template'
import { assert, isNil, stringify, toInteger, toValue } from '../util'

export function append(this: FilterImpl, v: string, arg: string) {
  assert(arguments.length === 2, 'append expect 2 arguments')
  const lhs = stringify(v)
  const rhs = stringify(arg)
  return lhs + rhs
}

export function prepend(this: FilterImpl, v: string, arg: string) {
  assert(arguments.length === 2, 'prepend expect 2 arguments')
  const lhs = stringify(v)
  const rhs = stringify(arg)
  return rhs + lhs
}

export function lstrip(this: FilterImpl, v: string, chars?: string) {
  const str = stringify(v)
  if (chars) {
    chars = stringify(chars)
    for (let i = 0, set = new Set(chars); i < str.length; i++) {
      if (!set.has(str[i])) return str.slice(i)
    }
    return ''
  }
  return str.trimStart()
}

export function downcase(this: FilterImpl, v: string) {
  const str = stringify(v)
  return str.toLowerCase()
}

export function upcase(this: FilterImpl, v: string) {
  const str = stringify(v)
  return stringify(str).toUpperCase()
}

export function remove(this: FilterImpl, v: string, arg: string) {
  const str = stringify(v)
  arg = stringify(arg)
  return str.split(arg).join('')
}

export function remove_first(this: FilterImpl, v: string, l: string) {
  const str = stringify(v)
  l = stringify(l)
  return str.replace(l, '')
}

export function remove_last(this: FilterImpl, v: string, l: string) {
  const str = stringify(v)
  const pattern = stringify(l)
  const index = str.lastIndexOf(pattern)
  if (index === -1) return str
  return str.substring(0, index) + str.substring(index + pattern.length)
}

export function rstrip(this: FilterImpl, str: string, chars?: string) {
  str = stringify(str)
  if (chars) {
    chars = stringify(chars)
    for (let i = str.length - 1, set = new Set(chars); i >= 0; i--) {
      if (!set.has(str[i])) return str.slice(0, i + 1)
    }
    return ''
  }
  return str.trimEnd()
}

export function split(this: FilterImpl, v: string, arg: string) {
  const str = stringify(v)
  const sep = stringify(arg)
  // a single space separates on whitespace runs and drops leading blanks,
  // as the reference String#split does
  if (sep === ' ') return awkSplit(str)
  const arr = str.split(sep)
  // align to ruby split, which is the behavior of shopify/liquid
  // see: https://ruby-doc.org/core-2.4.0/String.html#method-i-split
  while (arr.length && arr[arr.length - 1] === '') arr.pop()
  return arr
}

/** Ruby's `split(" ")` splits on ASCII whitespace only, not on a non-breaking space. */
const ASCII_WHITESPACE = /[ \t\n\v\f\r]/

function awkSplit(str: string, limit = Infinity): string[] {
  const words: string[] = []
  let i = 0
  while (i < str.length) {
    while (i < str.length && ASCII_WHITESPACE.test(str[i])) i++
    if (i >= str.length) {
      // with a limit, trailing whitespace leaves an empty last field
      if (limit !== Infinity && words.length && i > 0) words.push('')
      break
    }
    if (words.length === limit - 1) {
      words.push(str.slice(i))
      return words
    }
    let j = i
    while (j < str.length && !ASCII_WHITESPACE.test(str[j])) j++
    words.push(str.slice(i, j))
    i = j
  }
  return words
}

export function strip(this: FilterImpl, v: string, chars?: string) {
  const str = stringify(v)
  if (chars) {
    const set = new Set(stringify(chars))
    let i = 0
    let j = str.length - 1
    while (set.has(str[i])) i++
    while (j >= i && set.has(str[j])) j--
    return str.slice(i, j + 1)
  }
  return str.trim()
}

export function strip_newlines(this: FilterImpl, v: string) {
  const str = stringify(v)
  return str.replace(/\r?\n/gm, '')
}

export function squish(this: FilterImpl, v: string) {
  const str = stringify(v)
  return str.replace(/\s+/g, ' ').trim()
}

export function capitalize(this: FilterImpl, str: string) {
  str = stringify(str)
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export function replace(this: FilterImpl, v: string, pattern: string, replacement: string) {
  const str = stringify(v)
  pattern = stringify(pattern)
  replacement = stringify(replacement)
  if (pattern === '') {
    // an empty pattern matches at every position, including both ends
    let out = ''
    let at = 0
    for (const char of [...str, '']) {
      out += substitute(replacement, str, at, 0) + char
      at += char.length
    }
    return out
  }
  let out = ''
  let from = 0
  for (let at = str.indexOf(pattern); at !== -1; at = str.indexOf(pattern, from)) {
    out += str.slice(from, at) + substitute(replacement, str, at, pattern.length)
    from = at + pattern.length
  }
  return out + str.slice(from)
}

export function replace_first(this: FilterImpl, v: string, arg1: string, arg2: string) {
  const str = stringify(v)
  const pattern = stringify(arg1)
  const at = str.indexOf(pattern)
  if (at === -1) return str
  return str.slice(0, at) + substitute(stringify(arg2), str, at, pattern.length) + str.slice(at + pattern.length)
}

/**
 * A replacement as Ruby's `gsub` and `sub` read it: `\0` and `\&` insert the
 * match, `` \` `` and `\'` the text before and after it, a group reference
 * nothing, and `\\` a backslash.
 */
function substitute(replacement: string, str: string, at: number, length: number): string {
  if (!replacement.includes('\\')) return replacement
  return replacement.replace(/\\(k<[^>]*>|.)?/gs, (escape, code?: string) => {
    if (code === undefined) return escape
    if (code === '0' || code === '&') return str.slice(at, at + length)
    if (code === '`') return str.slice(0, at)
    if (code === "'") return str.slice(at + length)
    if (code === '\\') return '\\'
    if (/^[1-9+]$/.test(code)) return ''
    // Ruby raises an IndexError here, which the reference reports as an internal error
    if (code.startsWith('k<')) {
      throw Object.assign(new Error('internal'), { cause: `undefined group name reference: ${code.slice(2, -1)}` })
    }
    return escape
  })
}

export function replace_last(this: FilterImpl, v: string, arg1: string, arg2: string) {
  const str = stringify(v)
  const pattern = stringify(arg1)
  const replacement = stringify(arg2)
  const index = str.lastIndexOf(pattern)
  if (index === -1) return str
  return str.substring(0, index) + replacement + str.substring(index + pattern.length)
}

export function truncate(this: FilterImpl, v: string, length: unknown = 50, o = '...') {
  if (isNil(toValue(v))) return v
  const str = stringify(v)
  const l = Number(toInteger(length))
  o = stringify(o)
  const chars = [...str]
  const ellipsis = [...o]
  if (chars.length <= l) return str
  return chars.slice(0, Math.max(0, l - ellipsis.length)).join('') + o
}

export function truncatewords(this: FilterImpl, v: string, count: unknown = 15, o = '...') {
  if (isNil(toValue(v))) return v
  const str = stringify(v)
  o = stringify(o)
  let words = Math.min(Number(toInteger(count)), str.length + 1)
  if (words <= 0) words = 1
  const wordlist = awkSplit(str, words + 1)
  // nothing was cut off: the input is returned untouched, whitespace included
  if (wordlist.length <= words) return str
  wordlist.pop()
  return wordlist.join(' ') + o
}
