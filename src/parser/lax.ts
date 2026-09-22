import { Tokenizer } from './tokenizer'
import { defaultOperators, type Operators } from '../render/operator'
import type { FilterToken } from '../tokens'
import { isKeyValuePair } from './filter-arg'
import { fail, SYNTAX } from './strict2'
import { isQuotedToken } from '../util/type-guards'

/**
 * The reference engine's `lax` mode reads markup with permissive regular
 * expressions (`lax_parse`): junk between the parts it recognizes is skipped.
 * Markup this engine parses as written is left alone; other markup is
 * rewritten here into what the reference reads it as.
 */

const SPACE = '[ \\t\\r\\n\\f\\v]'
const QUOTED = `"[^"]*"|'[^']*'`
const FRAGMENT = `(?:${QUOTED}|(?:[^ \\t\\r\\n\\f\\v,|'"]|${QUOTED})+)`
const WORD = '[\\p{L}\\p{M}\\p{Nd}\\p{Pc}]'
const SEGMENT = `(?:${WORD}|-)`
const LITERALS: Record<string, string> = {
  nil: 'nil',
  null: 'nil',
  '': 'nil',
  true: 'true',
  false: 'false',
  blank: 'blank',
  empty: 'empty'
}
const CONDITION_OPERATORS = new Set(['==', '!=', '<>', '<', '>', '>=', '<=', 'contains'])

/** A comparison of a lax condition; its operator may be one the reference only rejects when it is evaluated. */
export type LaxComparison = { left: string; operator?: string; right: string }
/** The markup rewritten; a condition also as its comparisons, joined left to right by `and`/`or`. */
export type LaxMarkup = { markup: string; condition?: { comparisons: LaxComparison[]; relations: string[] } }

/** Rewrite a tag's markup the way the reference's lax parser reads it, or return nothing when it reads as written. */
export function laxTagMarkup(
  name: string,
  markup: string,
  operators: Operators,
  keyValueSeparator = ':'
): LaxMarkup | undefined {
  const rewrite = REWRITES[name]
  if (!rewrite || parsesCleanly(name, markup, operators, keyValueSeparator)) return
  return rewrite(markup)
}

/** Rewrite `{{ markup }}`, or return nothing when it reads as written. */
export function laxOutput(markup: string, operators: Operators): string | undefined {
  if (parsesCleanly('echo', markup, operators)) return
  return variable(markup)
}

function parsesCleanly(name: string, markup: string, operators: Operators, keyValueSeparator = ':'): boolean {
  // a quote that does not close is text to the reference, where the tokenizer reads a string to the end
  if (/["']/.test(markup.replace(/"[^"]*"|'[^']*'/g, ''))) return false
  // nor does an attribute with no value, as in `limit: ,`
  if (new RegExp(`\\w${SPACE}*${keyValueSeparator}${SPACE}*(?:,|$)`).test(markup)) return false
  const tokenizer = new Tokenizer(markup, operators)
  tokenizer.exactBrackets = true
  // an operator of this engine's own may take its operands in ways the reference has no word for
  const complete = !Object.keys(operators).some(op => !(op in defaultOperators) && markup.includes(op))
  try {
    CHECKS[name]?.(tokenizer, keyValueSeparator, complete)
    tokenizer.skipBlank()
    return tokenizer.end()
  } catch {
    return false
  }
}

function readValue(tokenizer: Tokenizer, _keyValueSeparator?: string, complete = false) {
  const value = tokenizer.readFilteredValue()
  if (!value.initial.single) throw new Error('more than one value')
  if (complete && !value.initial.complete) throw new Error('an operator without its operand')
  readsKeywords(value.filters)
}

/** The reference reads a keyword argument only by a word key with a value. */
function readsKeywords(filters: FilterToken[]) {
  for (const { args } of filters) {
    for (const arg of args) {
      if (isKeyValuePair(arg) && (!/^\w[\w-]*$/.test(arg[0] ?? '') || arg[1] === undefined)) throw new Error('keyword')
    }
  }
}

/** A condition the reference reads from its end: an `and`/`or` without an operand is an error there. */
function readCondition(tokenizer: Tokenizer, keyValueSeparator: string, complete: boolean) {
  if (conditionParts(tokenizer.remaining()).length % 2 === 0) throw new Error('an operand is missing')
  readValue(tokenizer, keyValueSeparator, complete)
}

/** An output reads one value; the reference's lax parser reads an operator with no operand as a lookup. */
function readOutputValue(tokenizer: Tokenizer) {
  const value = tokenizer.readFilteredValue()
  if (!value.initial.complete) throw new Error('not one complete value')
  readsKeywords(value.filters)
}

const CHECKS: Record<string, (tokenizer: Tokenizer, keyValueSeparator: string, complete: boolean) => void> = {
  echo: readOutputValue,
  if: readCondition,
  elsif: readCondition,
  unless: readCondition,
  case: readValue,
  when(tokenizer) {
    while (true) {
      tokenizer.readValueOrThrow()
      tokenizer.skipBlank()
      if (tokenizer.peek() === ',') tokenizer.advance()
      else if (tokenizer.end() || tokenizer.readIdentifier().content !== 'or') break
    }
  },
  assign(tokenizer) {
    if (!tokenizer.readIdentifier().size()) throw new Error('name')
    tokenizer.skipBlank()
    if (tokenizer.read() !== '=') throw new Error('=')
    readValue(tokenizer)
  },
  for: readLoop,
  tablerow: readLoop,
  capture(tokenizer) {
    if (!tokenizer.readIdentifier().size() && !tokenizer.readQuoted()) throw new Error('name')
  },
  cycle(tokenizer) {
    tokenizer.readValueOrThrow()
    tokenizer.skipBlank()
    if (tokenizer.peek() === ':') {
      tokenizer.advance()
      tokenizer.skipBlank()
      if (tokenizer.end()) throw new Error('no values')
    }
    while (!tokenizer.end()) {
      tokenizer.readValueOrThrow()
      tokenizer.skipBlank()
      if (tokenizer.end()) break
      if (tokenizer.read() !== ',') throw new Error(',')
    }
  },
  include: readPartial,
  render(tokenizer, keyValueSeparator) {
    const begin = tokenizer.p
    // the hosted `{% render block %}` is left to the tag, which rejects it outside that profile
    const name = tokenizer.readValue()
    if (!isQuotedToken(name) && name?.getText() !== 'block') throw new Error('quoted name')
    tokenizer.p = begin
    readPartial(tokenizer, keyValueSeparator)
  }
}

function readLoop(tokenizer: Tokenizer, keyValueSeparator: string) {
  if (!tokenizer.readIdentifier().size()) throw new Error('name')
  if (tokenizer.readIdentifier().content !== 'in') throw new Error('in')
  tokenizer.readValueOrThrow()
  readAttributes(tokenizer, keyValueSeparator, ['reversed'])
}

/** `key: value` attributes, as the reference reads them; a bare key is text to it, but for `bare` ones. */
function readAttributes(tokenizer: Tokenizer, keyValueSeparator: string, bare: string[] = []) {
  for (const { name, value } of tokenizer.readHashes(keyValueSeparator)) {
    if (!value && !bare.includes(name.content)) throw new Error(`bare ${name.content}`)
  }
}

/** As `include` and `render` read their markup: a name, `with`/`for` bindings, then arguments. */
function readPartial(tokenizer: Tokenizer, keyValueSeparator: string) {
  tokenizer.readValueOrThrow()
  while (!tokenizer.end()) {
    tokenizer.skipBlank()
    const begin = tokenizer.p
    const keyword = tokenizer.readIdentifier().content
    tokenizer.skipBlank()
    const value = (keyword === 'with' || keyword === 'for') && tokenizer.peek() !== ':' && tokenizer.readValue()
    if (!value) {
      tokenizer.p = begin
      break
    }
    const before = tokenizer.p
    if (tokenizer.readIdentifier().content === 'as') tokenizer.readIdentifier()
    else tokenizer.p = before
    tokenizer.skipBlank()
    if (tokenizer.peek() === ',') tokenizer.advance()
  }
  readAttributes(tokenizer, keyValueSeparator)
}

const REWRITES: Record<string, (markup: string) => LaxMarkup> = {
  echo: markup => ({ markup: variable(markup) }),
  if: condition,
  elsif: condition,
  unless: condition,
  case(markup) {
    const match = new RegExp(FRAGMENT).exec(markup)
    if (!match) fail(SYNTAX.case)
    return { markup: expression(match[0]) }
  },
  when(markup) {
    const values: string[] = []
    const syntax = new RegExp(`(${FRAGMENT})(?:(?:${SPACE}+or${SPACE}+|${SPACE}*,${SPACE}*)(${FRAGMENT}[\\s\\S]*))?`)
    let rest: string | undefined = markup
    while (rest) {
      const match = syntax.exec(rest)
      if (!match) break
      values.push(expression(match[1]))
      rest = match[2]
    }
    return { markup: values.join(', ') }
  },
  assign(markup) {
    const match = /((?:\(?[\w\-.[\]]\)?)+)\s*=\s*([\s\S]*)\s*/.exec(markup)
    if (!match) fail(SYNTAX.assign)
    // a name that is no identifier, like `a.b`, is kept whole as the reference keeps it
    const name = /^[\w-]+$/.test(match[1]) ? match[1] : quote(match[1])
    return { markup: `${name} = ${variable(match[2])}` }
  },
  for(markup) {
    const match = new RegExp(`^(${SEGMENT}+)${SPACE}+in${SPACE}+(${FRAGMENT}+)${SPACE}*(reversed)?`, 'u').exec(markup)
    if (!match) fail(SYNTAX.for)
    const attributes = tagAttributes(markup).filter(([key]) => key === 'limit' || key === 'offset')
    const reversed = match[3] ? ' reversed' : ''
    return { markup: `${match[1]} in ${expression(match[2])}${reversed}${joinAttributes(attributes, ' ')}` }
  },
  tablerow(markup) {
    const match = new RegExp(`(${WORD}+)${SPACE}+in${SPACE}+(${FRAGMENT}+)`, 'u').exec(markup)
    if (!match) fail(SYNTAX.tablerow)
    return { markup: `${match[1]} in ${expression(match[2])}${joinAttributes(tagAttributes(markup), ' ')}` }
  },
  cycle(markup) {
    const named = new RegExp(`^(${FRAGMENT})${SPACE}*:${SPACE}*([\\s\\S]*)$`).exec(markup)
    if (!named && !new RegExp(`^(?:${FRAGMENT})+`).test(markup)) fail(SYNTAX.cycle)
    const values = cycleValues(named ? named[2] : markup)
    // with no value a cycle renders nil, as a nil value does
    const list = (values.length ? values : ['nil']).join(', ')
    return { markup: named ? `${expression(named[1])}: ${list}` : list }
  },
  capture(markup) {
    const match = /(?:\(?[\w\-.[\]]\)?)+/.exec(markup)
    if (!match) fail(SYNTAX.capture)
    return { markup: quote(match[0]) }
  },
  include: markup => partial(markup, FRAGMENT, SYNTAX.include),
  render: markup => partial(markup, `(?:${QUOTED})`, SYNTAX.render)
}

function cycleValues(markup: string): string[] {
  return markup
    .split(',')
    .map(part => new RegExp(`${SPACE}*(${FRAGMENT})${SPACE}*`).exec(part)?.[1])
    .filter((part): part is string => part !== undefined)
    .map(expression)
}

function partial(markup: string, name: string, error: string): LaxMarkup {
  const syntax = new RegExp(
    `(${name}+)(${SPACE}+(with|for)${SPACE}+(${FRAGMENT}+))?(${SPACE}+as${SPACE}+(${SEGMENT}+))?`,
    'u'
  )
  const match = syntax.exec(markup)
  if (!match) fail(error)
  let head = expression(match[1])
  if (match[3]) head += ` ${match[3]} ${expression(match[4])}`
  if (match[6]) head += ` as ${match[6]}`
  return { markup: `${head}${joinAttributes(tagAttributes(markup), ', ')}` }
}

function tagAttributes(markup: string): [string, string][] {
  const attributes = new RegExp(`(${WORD}[\\p{L}\\p{M}\\p{Nd}\\p{Pc}-]*)${SPACE}*:${SPACE}*(${FRAGMENT})`, 'gu')
  return [...markup.matchAll(attributes)].map(match => [match[1], expression(match[2])])
}

function joinAttributes(attributes: [string, string][], separator: string): string {
  return attributes.length ? separator + attributes.map(([key, value]) => `${key}: ${value}`).join(', ') : ''
}

/** The reference's `ExpressionsAndOperators` scan: comparisons and the `and`/`or` between them. */
function conditionParts(markup: string): string[] {
  const operatorWord = `\\b(?:${SPACE}?and${SPACE}?|${SPACE}?or${SPACE}?)\\b`
  const expressionsAndOperators = new RegExp(
    `(?:${operatorWord}|(?:${SPACE}*(?!${operatorWord})(?:${FRAGMENT}|[^ \\t\\r\\n\\f\\v]+)${SPACE}*)+)`,
    'g'
  )
  return [...markup.matchAll(expressionsAndOperators)].map(match => match[0])
}

function condition(markup: string): LaxMarkup {
  const syntax = new RegExp(`(${FRAGMENT})${SPACE}*([=!<>a-z_]+)?${SPACE}*(${FRAGMENT})?`)
  const parts = conditionParts(markup)
  // read from the end as the reference does, a leading or trailing `and`/`or` leaves an operator without its operand
  if (parts.length % 2 === 0) fail(SYNTAX.if)
  const comparisons: LaxComparison[] = []
  const relations: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      relations.push(parts[i].trim())
      continue
    }
    const match = syntax.exec(parts[i])
    if (!match) fail(SYNTAX.if)
    comparisons.push({ left: expression(match[1]), operator: match[2], right: expression(match[3]) })
  }
  if (!comparisons.length) return { markup: 'nil' }
  const known = comparisons.every(c => c.operator === undefined || CONDITION_OPERATORS.has(c.operator))
  const text = comparisons.map(c => (c.operator === undefined ? c.left : `${c.left} ${c.operator} ${c.right}`))
  return {
    markup: known ? text.map((c, i) => (i ? `${relations[i - 1]} ${c}` : c)).join(' ') : 'nil',
    condition: { comparisons, relations }
  }
}

/** The reference's lax `Variable`: an expression, then filters wherever a `|` is found. */
export function variable(markup: string): string {
  const match = new RegExp(`(${FRAGMENT})([\\s\\S]*)`).exec(markup)
  if (!match) return 'nil'
  let result = expression(match[1])
  const filters = /\|\s*([\s\S]*)/.exec(match[2])
  if (!filters) return result
  const chunks = filters[1].match(new RegExp(`(?:${SPACE}+|${FRAGMENT}|,)+`, 'g')) ?? []
  const argument = new RegExp(`(?::|,)${SPACE}*((?:\\w+${SPACE}*:${SPACE}*)?${FRAGMENT})`, 'g')
  for (const chunk of chunks) {
    const name = /\w+/.exec(chunk)
    if (!name) continue
    const args = [...chunk.matchAll(argument)].map(([, arg]) => {
      const keyword = new RegExp(`^(\\w[\\w-]*)${SPACE}*:${SPACE}*(${FRAGMENT})$`).exec(arg)
      return keyword ? `${keyword[1]}: ${expression(keyword[2])}` : expression(arg)
    })
    result += ` | ${name[0]}${args.length ? ': ' + args.join(', ') : ''}`
  }
  return result
}

/** The reference's lax `Expression.parse`. */
export function expression(markup: string | undefined): string {
  if (markup === undefined) return 'nil'
  const text = markup.replace(/^[\s\0]+|[\s\0]+$/g, '')
  if (text.length > 1 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0]) {
    return quote(text.slice(1, -1))
  }
  if (text in LITERALS) return LITERALS[text]
  if (text === '-') return `["-"]`
  const range = /^\(\s*(\S+)\s*\.\.\s*(\S+)\s*\)$/.exec(text)
  if (range) return rangeOf(range[1], range[2])
  const num = numberOf(text)
  if (num !== undefined) return num
  return lookup(text)
}

function rangeOf(low: string, high: string): string {
  const [l, h] = [numberOf(low.trim()), numberOf(high.trim())]
  // literal bounds are read as integers, as `to_i` reads them
  const bound = (num: string | undefined, text: string) =>
    num === undefined ? expression(text) : String(Math.trunc(Number(num)))
  return `(${bound(l, low)}..${bound(h, high)})`
}

function numberOf(text: string): string | undefined {
  if (/^-?\d+$/.test(text) || /^-?\d+\.\d+$/.test(text)) return text
  if (!/^-?\d[\d.]*$/.test(text)) return
  const first = text.indexOf('.')
  const second = text.indexOf('.', first + 1)
  const digits = second === -1 ? (first === text.length - 1 ? text.slice(0, first) : text) : text.slice(0, second)
  const num = Number(digits.endsWith('.') ? digits.slice(0, -1) : digits)
  return Number.isInteger(num) ? `${Object.is(num, -0) ? '-0' : num}.0` : String(num)
}

function lookup(text: string): string {
  const segments: string[] = []
  const word = new RegExp(`^${SEGMENT}+\\??`, 'u')
  for (let i = 0; i < text.length;) {
    if (text[i] === '[') {
      const end = closingBracket(text, i)
      if (end !== -1) {
        segments.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    const match = word.exec(text.slice(i))
    if (match) {
      segments.push(match[0])
      i += match[0].length
    } else i++
  }
  // a lookup with no name reads nothing, but is not the nil literal
  if (!segments.length) return '[nil]'
  return segments
    .map((segment, i) => {
      if (segment.startsWith('[')) return `[${expression(segment.slice(1, -1))}]`
      if (/^[A-Za-z_][\w-]*\??$/.test(segment)) return i ? `.${segment}` : segment
      return `[${quote(segment)}]`
    })
    .join('')
}

function closingBracket(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']' && --depth === 0) return i
  }
  return -1
}

function quote(content: string): string {
  if (!content.includes("'")) return `'${content}'`
  if (!content.includes('"')) return `"${content}"`
  return `'${content.replace(/'/g, '')}'`
}
