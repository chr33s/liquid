/**
 * The reference engine's `strict2` grammar for tag and output markup, ported
 * from Shopify/liquid (`lexer.rb`, `parser.rb` and each tag's
 * `strict2_parse`). It decides what is accepted, how a rejection reads, and
 * reads what it accepts into the tokens the templates evaluate.
 */

import {
  FilteredValueToken,
  FilterToken,
  HashToken,
  IdentifierToken,
  LiteralToken,
  NumberToken,
  OperatorToken,
  PropertyAccessToken,
  QuotedToken,
  RangeToken,
  Token,
  ValueToken
} from '../tokens'
import { Expression } from '../render'
import { hasOwnProperty, literalValues } from '../util'
import type { FilterArg } from './filter-arg'

type TokenType =
  | 'id'
  | 'number'
  | 'string'
  | 'comparison'
  | 'pipe'
  | 'dot'
  | 'dotdot'
  | 'colon'
  | 'comma'
  | 'open_square'
  | 'close_square'
  | 'open_round'
  | 'close_round'
  | 'question'
  | 'dash'
  | 'end_of_string'

interface LexToken {
  type: TokenType
  value?: string
  begin: number
  end: number
}

/** Markup to read: `input` from `begin` to `end`. */
export interface Source {
  input: string
  begin: number
  end: number
  file?: string
}

/** The markup of a tag's arguments. */
export function markupOf(token: {
  input: string
  argsBegin: number
  contentRange: [number, number]
  file?: string
}): Source {
  return { input: token.input, begin: token.argsBegin, end: token.contentRange[1], file: token.file }
}

const SPECIAL: Record<string, TokenType> = {
  '|': 'pipe',
  '.': 'dot',
  ':': 'colon',
  ',': 'comma',
  '[': 'open_square',
  ']': 'close_square',
  '(': 'open_round',
  ')': 'close_round',
  '?': 'question',
  '-': 'dash'
}
const WHITESPACE = /[ \t\r\n\f\v]*/y
const IDENTIFIER = /[a-zA-Z_][\w-]*\??/y
const NUMBER = /-?\d+(\.\d+)?/y
const SINGLE_QUOTED = /'[^']*'/y
const DOUBLE_QUOTED = /"[^"]*"/y

export class Strict2SyntaxError extends Error {}

export function fail(message: string): never {
  throw new Strict2SyntaxError(message)
}

function scan(pattern: RegExp, input: string, p: number): string | undefined {
  pattern.lastIndex = p
  return pattern.exec(input)?.[0]
}

export function tokenize(source: string, offset = 0): LexToken[] {
  const output: LexToken[] = []
  const push = (type: TokenType, value: string | undefined, p: number) =>
    output.push({ type, value, begin: offset + p, end: offset + p + (value?.length ?? 0) })
  let p = 0
  while (p < source.length) {
    p += scan(WHITESPACE, source, p)!.length
    if (p >= source.length) break
    const c = source[p]
    const next = source[p + 1]
    const special = SPECIAL[c]
    let text: string | undefined
    let type: TokenType
    if (special) {
      if (special === 'dot' && next === '.') [type, text] = ['dotdot', '..']
      else if (special === 'dash' && next >= '0' && next <= '9') [type, text] = ['number', scan(NUMBER, source, p)!]
      else [type, text] = [special, c]
    } else if (c === '=' || c === '!') {
      if (next !== '=') fail(`Unexpected character ${c}`)
      ;[type, text] = ['comparison', c + '=']
    } else if (c === '<' || c === '>') {
      ;[type, text] = ['comparison', next === '=' || (c === '<' && next === '>') ? c + next : c]
    } else {
      const pattern = /[a-zA-Z_]/.test(c)
        ? IDENTIFIER
        : /\d/.test(c)
          ? NUMBER
          : c === "'"
            ? SINGLE_QUOTED
            : c === '"'
              ? DOUBLE_QUOTED
              : undefined
      text = pattern && scan(pattern, source, p)
      if (!text) fail(`Unexpected character ${String.fromCodePoint(source.codePointAt(p)!)}`)
      type = pattern === IDENTIFIER ? 'id' : pattern === NUMBER ? 'number' : 'string'
      if (type === 'id' && text === 'contains' && output[output.length - 1]?.type !== 'dot') type = 'comparison'
    }
    push(type, text, p)
    p += text!.length
  }
  push('end_of_string', undefined, p)
  return output
}

/** How the reference prints a token in an error: Ruby's `Array#inspect`. */
function inspect({ type, value }: LexToken): string {
  return value === undefined ? `[:${type}]` : `[:${type}, ${JSON.stringify(value)}]`
}

export class Strict2Parser {
  public readonly source: Source
  private tokens: LexToken[]
  private p = 0

  public constructor(
    source: Source | string,
    private readonly rejectBareBrackets = true
  ) {
    this.source = typeof source === 'string' ? { input: source, begin: 0, end: source.length } : source
    const { input, begin, end } = this.source
    this.tokens = tokenize(input.slice(begin, end), begin)
  }

  public consume(type?: TokenType): LexToken {
    const token = this.tokens[this.p]
    if (type && token.type !== type) fail(`Expected ${type} but found ${token.type}`)
    this.p++
    return token
  }

  public consumeIf(type: TokenType): LexToken | undefined {
    const token = this.tokens[this.p]
    if (!token || token.type !== type) return
    this.p++
    return token
  }

  public id(name: string): LexToken | undefined {
    const token = this.tokens[this.p]
    if (!token || token.type !== 'id' || token.value !== name) return
    this.p++
    return token
  }

  public look(type: TokenType, ahead = 0): boolean {
    return this.tokens[this.p + ahead]?.type === type
  }

  /** The token to read next. */
  public get next(): LexToken {
    return this.tokens[this.p]
  }

  /** Where the markup read so far ends. */
  public get end(): number {
    return this.p ? this.tokens[this.p - 1].end : this.source.begin
  }

  public identifier(token: LexToken): IdentifierToken {
    return new IdentifierToken(this.source.input, token.begin, token.end, this.source.file)
  }

  public operator(token: LexToken): OperatorToken {
    return new OperatorToken(this.source.input, token.begin, token.end, this.source.file)
  }

  public expression(): ValueToken {
    const { input, file } = this.source
    const token = this.tokens[this.p]
    switch (token.type) {
      case 'id': {
        this.consume()
        const props = this.variableLookups()
        if (!props.length && hasOwnProperty.call(literalValues, token.value!)) {
          return new LiteralToken(input, token.begin, token.end, file)
        }
        return new PropertyAccessToken(
          undefined,
          [this.identifier(token), ...props],
          input,
          token.begin,
          this.end,
          file
        )
      }
      case 'open_square': {
        if (this.rejectBareBrackets) fail("Bare bracket access is not allowed. Use self['...'] instead")
        this.consume()
        const key = this.expression()
        this.consume('close_square')
        const props = this.variableLookups()
        return new PropertyAccessToken(undefined, [key, ...props], input, token.begin, this.end, file)
      }
      case 'string':
        this.consume()
        return new QuotedToken(input, token.begin, token.end, file)
      case 'number':
        this.consume()
        return new NumberToken(input, token.begin, token.end, file)
      case 'open_round': {
        this.consume()
        const lhs = this.expression()
        this.consume('dotdot')
        const rhs = this.expression()
        this.consume('close_round')
        return new RangeToken(input, token.begin, this.end, lhs, rhs, file)
      }
      default:
        fail(`${inspect(token)} is not a valid expression`)
    }
  }

  private variableLookups(): (ValueToken | IdentifierToken)[] {
    const props: (ValueToken | IdentifierToken)[] = []
    while (true) {
      if (this.consumeIf('open_square')) {
        props.push(this.expression())
        this.consume('close_square')
      } else if (this.consumeIf('dot')) {
        props.push(this.identifier(this.consume('id')))
      } else return props
    }
  }

  /** A filtered value of `tokens` from `begin` to what was read so far. */
  public filteredValue(tokens: Token[], filters: FilterToken[], begin: number): FilteredValueToken {
    return new FilteredValueToken(
      new Expression(tokens.values()),
      filters,
      this.source.input,
      begin,
      this.end,
      this.source.file
    )
  }

  public hash(key: LexToken, value?: ValueToken): HashToken {
    return new HashToken(
      this.source.input,
      key.begin,
      value?.end ?? key.end,
      this.identifier(key),
      value,
      this.source.file
    )
  }
}

export const SYNTAX = {
  assign: "Syntax Error in 'assign' - Valid syntax: assign [var] = [source]",
  capture: "Syntax Error in 'capture' - Valid syntax: capture [var]",
  case: "Syntax Error in 'case' - Valid syntax: case [condition]",
  for: "Syntax Error in 'for loop' - Valid syntax: for [item] in [collection]",
  if: "Syntax Error in tag 'if' - Valid syntax: if [expression]",
  include: "Error in tag 'include' - Valid syntax: include '[template]' (with|for) [object|collection]",
  render: "Syntax error in tag 'render' - Template name must be a quoted string",
  tablerow: "Syntax Error in 'table_row loop' - Valid syntax: table_row [item] in [collection] cols=3",
  caseElse: "Syntax Error in tag 'case' - Valid else condition: {% else %} (no parameters) ",
  cycle: "Syntax Error in 'cycle' - Valid syntax: cycle [name :] var [, var2, var3 ...]",
  forIn: "For loops require an 'in' clause",
  forAttribute: 'Invalid attribute in for loop. Valid attributes are limit and offset',
  tablerowAttribute: (name: string) =>
    `Invalid attribute '${name}' in tablerow loop. Valid attributes are cols, limit, offset, and range`
}

const TABLEROW_ATTRIBUTES = new Set(['cols', 'limit', 'offset', 'range'])
/** `Assign::Syntax` of the reference: `(VariableSignature+)\s*=\s*(.*)\s*`, unanchored. */
const ASSIGN_SYNTAX = /((?:\(?[\w\-.[\]]\)?)+)\s*=\s*([\s\S]*)\s*/

/** `{{ markup }}`, and the value of `echo` and `assign`; empty markup reads as nothing. */
export function variable(source: Source): FilteredValueToken | undefined {
  const p = new Strict2Parser(source)
  if (p.look('end_of_string')) return
  const begin = p.next.begin
  const initial = p.expression()
  const filters: FilterToken[] = []
  while (p.consumeIf('pipe')) {
    const name = p.consume('id')
    const args: FilterArg[] = []
    if (p.consumeIf('colon')) {
      const end = () => p.look('pipe') || p.look('end_of_string')
      if (!end()) args.push(argument(p))
      while (p.consumeIf('comma') && !end()) args.push(argument(p))
    }
    filters.push(new FilterToken(name.value!, args, source.input, name.begin, p.end, source.file))
  }
  const value = p.filteredValue([initial], filters, begin)
  p.consume('end_of_string')
  return value
}

function argument(p: Strict2Parser): FilterArg {
  if (p.look('id') && p.look('colon', 1)) {
    const key = p.consume('id')
    p.consume('colon')
    return [key.value!, p.expression()]
  }
  return p.expression()
}

function identifier(source: Source): IdentifierToken {
  const p = new Strict2Parser(source)
  const name = p.identifier(p.consume('id'))
  p.consume('end_of_string')
  return name
}

function condition(source: Source): FilteredValueToken {
  const p = new Strict2Parser(source)
  const tokens: Token[] = []
  const begin = p.next.begin
  while (true) {
    tokens.push(p.expression())
    const comparison = p.consumeIf('comparison')
    if (comparison) tokens.push(p.operator(comparison), p.expression())
    const relation = p.id('and') || p.id('or')
    if (!relation) break
    tokens.push(p.operator(relation))
  }
  const value = p.filteredValue(tokens, [], begin)
  p.consume('end_of_string')
  return value
}

/** The arguments of `include` and `render`: a `with` or `for` binding, an alias, then keyword arguments. */
export interface PartialMarkup<File extends ValueToken = ValueToken> {
  file: File
  binding?: { keyword: 'with' | 'for'; value: ValueToken }
  alias?: IdentifierToken
  hash: HashToken[]
}

function partial<File extends ValueToken>(p: Strict2Parser, file: File): PartialMarkup<File> {
  const markup: PartialMarkup<File> = { file, hash: [] }
  const keyword = p.id('for') || p.id('with')
  if (keyword) markup.binding = { keyword: keyword.value as 'with' | 'for', value: p.expression() }
  if (p.id('as')) markup.alias = p.identifier(p.consume('id'))
  p.consumeIf('comma')
  while (p.look('id')) {
    const key = p.consume()
    p.consume('colon')
    markup.hash.push(p.hash(key, p.expression()))
    p.consumeIf('comma')
  }
  p.consume('end_of_string')
  return markup
}

/** A loop's variable, collection and attributes. */
export interface LoopMarkup {
  variable: IdentifierToken
  collection: ValueToken
  hash: HashToken[]
}

/**
 * The markup rules of the tags the reference defines, keyed by tag name, each
 * reading the tag's arguments; `case` also covers `when` and `else`.
 */
export const tagMarkup = {
  echo: (source: Source) => ({ value: variable(source) }),
  assign(source: Source) {
    const markup = source.input.slice(source.begin, source.end)
    const match = ASSIGN_SYNTAX.exec(markup)
    if (!match) fail(SYNTAX.assign)
    const nameBegin = source.begin + match.index
    const name = identifier({ ...source, begin: nameBegin, end: nameBegin + match[1].length })
    const valueBegin = source.end - match[2].length
    const value =
      variable({ ...source, begin: valueBegin }) ??
      new Strict2Parser({ ...source, begin: source.end }).filteredValue([], [], source.end)
    return { name, value }
  },
  capture: identifier,
  increment: identifier,
  decrement: identifier,
  if: condition,
  elsif: condition,
  unless: condition,
  case(source: Source) {
    const p = new Strict2Parser(source)
    const value = p.filteredValue([p.expression()], [], p.next.begin)
    p.consume('end_of_string')
    return value
  },
  when(source: Source) {
    const p = new Strict2Parser(source)
    const values: ValueToken[] = []
    do values.push(p.expression())
    while (p.id('or') || p.consumeIf('comma'))
    p.consume('end_of_string')
    return values
  },
  else(source: Source, { parent }: MarkupOptions = {}) {
    if (parent === 'case' && source.input.slice(source.begin, source.end).trim()) fail(SYNTAX.caseElse)
  },
  cycle(source: Source) {
    const p = new Strict2Parser(source)
    if (p.look('end_of_string')) fail(SYNTAX.cycle)
    const first = p.expression()
    const group = p.consumeIf('colon') ? first : undefined
    const candidates = [group ? p.expression() : first]
    while (p.consumeIf('comma')) {
      if (p.look('end_of_string')) break
      candidates.push(p.expression())
    }
    p.consume('end_of_string')
    return { group, candidates }
  },
  for(source: Source): LoopMarkup {
    return forLoop(new Strict2Parser(source))
  },
  tablerow(source: Source): LoopMarkup {
    const p = new Strict2Parser(source)
    const variable = p.identifier(p.consume('id'))
    if (!p.id('in')) fail(SYNTAX.forIn)
    const collection = p.expression()
    const hash: HashToken[] = []
    p.consumeIf('comma')
    while (p.look('id')) {
      const key = p.consume()
      if (!TABLEROW_ATTRIBUTES.has(key.value!)) fail(SYNTAX.tablerowAttribute(key.value!))
      p.consume('colon')
      hash.push(p.hash(key, p.expression()))
      p.consumeIf('comma')
    }
    p.consume('end_of_string')
    return { variable, collection, hash }
  },
  include(source: Source) {
    const p = new Strict2Parser(source)
    return partial(p, p.expression())
  },
  render(source: Source, options: MarkupOptions = {}): PartialMarkup {
    const p = new Strict2Parser(source)
    // the hosted `{% render block %}` renders an app block
    if (options.hosted && p.next.type === 'id' && p.next.value === 'block') return partial(p, p.expression())
    const file = p.consume('string')
    return partial(p, new QuotedToken(source.input, file.begin, file.end, source.file))
  }
}

export type TagMarkup = typeof tagMarkup
/** What the `strict2` grammar read from the markup of tag `name`. */
export type ParsedMarkup<Name extends keyof TagMarkup> = ReturnType<TagMarkup[Name]>

/** How the markup is read: `hosted` for the `shopify_theme` profile, `parent` the enclosing block. */
export interface MarkupOptions {
  hosted?: boolean
  parent?: string
}

/** Read the markup of a tag the reference defines, or return nothing for another tag. */
export function readTagMarkup(name: string, source: Source, options: MarkupOptions = {}): unknown {
  if (!hasOwnProperty.call(tagMarkup, name)) return
  return (tagMarkup as Record<string, (source: Source, options: MarkupOptions) => unknown>)[name](source, options)
}

function forLoop(p: Strict2Parser): LoopMarkup {
  const variable = p.identifier(p.consume('id'))
  if (!p.id('in')) fail(SYNTAX.forIn)
  const collection = p.expression()
  const hash: HashToken[] = []
  const reversed = p.id('reversed')
  if (reversed) hash.push(p.hash(reversed))
  while (p.look('comma') || p.look('id')) {
    p.consumeIf('comma')
    const key = p.id('limit') || p.id('offset')
    if (!key) fail(SYNTAX.forAttribute)
    p.consume('colon')
    hash.push(p.hash(key, p.expression()))
  }
  p.consume('end_of_string')
  return { variable, collection, hash }
}

/**
 * The reference's `strict` mode parses outputs, conditions and `for` with the
 * same lexer, allowing bare brackets, and requiring filter arguments after a
 * colon with no trailing comma. Its other tags keep the lax grammar.
 */
export const strictMarkup: Record<string, (markup: string) => void> = {
  output: strictVariable,
  echo: strictVariable,
  if: markup => strictCondition(markup),
  elsif: markup => strictCondition(markup),
  unless: markup => strictCondition(markup),
  for: markup => void forLoop(new Strict2Parser(markup, false)),
  assign(markup) {
    const match = ASSIGN_SYNTAX.exec(markup)
    if (!match) fail(SYNTAX.assign)
    strictVariable(match[2])
  }
}

function strictVariable(markup: string): void {
  const p = new Strict2Parser(markup, false)
  if (p.look('end_of_string')) return
  p.expression()
  while (p.consumeIf('pipe')) {
    p.consume('id')
    if (p.consumeIf('colon')) {
      do argument(p)
      while (p.consumeIf('comma'))
    }
  }
  p.consume('end_of_string')
}

function strictCondition(markup: string): void {
  const p = new Strict2Parser(markup, false)
  do {
    p.expression()
    if (p.consumeIf('comparison')) p.expression()
  } while (p.id('and') || p.id('or'))
  p.consume('end_of_string')
}
