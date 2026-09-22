import {
  FilteredValueToken,
  TagToken,
  HTMLToken,
  HashToken,
  QuotedToken,
  LiquidTagToken,
  OutputToken,
  ValueToken,
  Token,
  RangeToken,
  FilterToken,
  TopLevelToken,
  PropertyAccessToken,
  OperatorToken,
  LiteralToken,
  IdentifierToken,
  NumberToken
} from '../tokens'
import { OperatorHandler } from '../render/operator'
import {
  LiteralValue,
  Trie,
  createTrie,
  ellipsis,
  literalValues,
  TokenizationError,
  TYPES,
  QUOTE,
  BLANK,
  NUMBER,
  SIGN,
  isWord,
  isString
} from '../util'
import { Operators, Expression } from '../render'
import { NormalizedFullOptions, defaultOptions } from '../liquid-options'
import { FilterArg } from './filter-arg'
import { whiteSpaceCtrl } from './whitespace-ctrl'
import { isHosted } from '../theme/profile'

/** Tags whose body is read verbatim rather than tokenized as Liquid. */
const RAW_BODY_TAGS: ReadonlySet<string> = new Set(['raw', 'doc'])
/** Raw-body tags the hosted theme dialect adds. */
const HOSTED_RAW_BODY_TAGS: ReadonlySet<string> = new Set(['schema', 'stylesheet', 'javascript'])

export class Tokenizer {
  p: number
  N: number
  /** `errorMode: "lax"`: tolerate markup the other modes reject. */
  lax = false
  /** A bracket lookup closes right after the one value it holds, as the reference reads it. */
  exactBrackets = false
  private rawBeginAt = -1
  private rawTagName = 'raw'
  private rawToken?: TagToken
  private opTrie: Trie<OperatorHandler>
  private literalTrie: Trie<LiteralValue>

  constructor(
    public input: string,
    operators: Operators = defaultOptions.operators,
    public file?: string,
    range?: [number, number]
  ) {
    this.p = range ? range[0] : 0
    this.N = range ? range[1] : input.length
    this.opTrie = createTrie(operators)
    this.literalTrie = createTrie(literalValues)
  }

  readExpression() {
    return new Expression(this.readExpressionTokens())
  }

  *readExpressionTokens(): IterableIterator<Token> {
    while (this.p < this.N) {
      const operator = this.readOperator()
      if (operator) {
        yield operator
        continue
      }
      const operand = this.readValue()
      if (operand) {
        yield operand
        continue
      }
      return
    }
  }
  readOperator(): OperatorToken | undefined {
    this.skipBlank()
    const end = this.matchTrie(this.opTrie)
    if (end === -1) return
    return new OperatorToken(this.input, this.p, (this.p = end), this.file)
  }
  matchTrie<T>(trie: Trie<T>) {
    let node: Trie<T> = trie
    let i = this.p
    let info: Trie<T> | undefined
    while ((node as Trie<T>)[this.input[i]] && i < this.N) {
      node = (node as Trie<T>)[this.input[i++]] as Trie<T>
      if (node['end']) info = node
    }
    if (!info) return -1
    if (info['needBoundary'] && isWord(this.peek(i - this.p))) return -1
    return i
  }
  readFilteredValue(): FilteredValueToken {
    const begin = this.p
    const initial = this.readExpression()
    this.assert(initial.valid(), `invalid value expression: ${this.snapshot()}`)
    const filters = this.readFilters()
    return new FilteredValueToken(initial, filters, this.input, begin, this.p, this.file)
  }
  readFilters(): FilterToken[] {
    const filters = []
    while (true) {
      const filter = this.readFilter()
      if (!filter) return filters
      filters.push(filter)
    }
  }
  readFilter(): FilterToken | null {
    this.skipBlank()
    if (this.end()) return null
    this.assert(this.read() === '|', `expected "|" before filter`)
    const name = this.readIdentifier()
    if (!name.size()) {
      // lax mode reads `a || f` as `a | f`
      if (this.lax && this.peek() === '|') return this.readFilter()
      this.assert(this.end(), `expected filter name`)
      return null
    }
    const args = []
    this.skipBlank()
    if (this.peek() === ':') {
      do {
        ++this.p
        const arg = this.readFilterArg()
        arg && args.push(arg)
        this.skipBlank()
        this.assert(
          this.end() || this.peek() === ',' || this.peek() === '|',
          () => `unexpected character ${this.snapshot()}`
        )
      } while (this.peek() === ',')
    } else if (this.peek() === '|' || this.end()) {
      // do nothing
    } else {
      throw this.error('expected ":" after filter name')
    }
    return new FilterToken(name.getText(), args, this.input, name.begin, this.p, this.file)
  }

  readFilterArg(): FilterArg | undefined {
    const key = this.readValue()
    if (!key) return
    this.skipBlank()
    if (this.peek() !== ':') return key
    ++this.p
    const value = this.readValue()
    return [key.getText(), value]
  }

  readTopLevelTokens(options: NormalizedFullOptions = defaultOptions): TopLevelToken[] {
    const tokens: TopLevelToken[] = []
    while (this.p < this.N) {
      const token = this.readTopLevelToken(options)
      tokens.push(token)
    }
    whiteSpaceCtrl(tokens, options)
    return tokens
  }

  readTopLevelToken(options: NormalizedFullOptions): TopLevelToken {
    const { tagDelimiterLeft, outputDelimiterLeft } = options
    if (this.rawBeginAt > -1) return this.readEndrawOrRawContent(options)
    if (this.match(tagDelimiterLeft)) return this.readTagToken(options)
    if (this.match(outputDelimiterLeft)) return this.readOutputToken(options)
    return this.readHTMLToken([tagDelimiterLeft, outputDelimiterLeft])
  }

  readHTMLToken(stopStrings: string[]): HTMLToken {
    const begin = this.p
    while (this.p < this.N) {
      if (stopStrings.some(str => this.match(str))) break
      ++this.p
    }
    return new HTMLToken(this.input, begin, this.p, this.file)
  }

  readTagToken(options: NormalizedFullOptions): TagToken {
    const { file, input } = this
    const begin = this.p
    // as the reference, a malformed tag is an error only once the parse reaches it
    if (this.readToDelimiter(options.tagDelimiterRight) === -1) {
      const message = `Tag '${this.excerpt(begin)}' was not properly terminated with regexp: /\\%\\}/`
      return malform(new TagToken(input, begin, this.N, options, file), this.error(message, begin), true)
    }
    const token = new TagToken(input, begin, this.p, options, file)
    if (token.name === 'raw' && token.args.trim()) {
      malform(token, this.error("Syntax Error in 'raw' - Valid syntax: raw", begin))
    }
    if (token.name === 'doc' && token.args.trim()) {
      malform(token, this.error("Syntax Error in 'doc' - Valid syntax: {% doc %}{% enddoc %}", begin))
    }
    if (RAW_BODY_TAGS.has(token.name) || (isHosted(options.profile) && HOSTED_RAW_BODY_TAGS.has(token.name))) {
      this.rawBeginAt = begin
      this.rawTagName = token.name
      this.rawToken = token
    }
    return token
  }

  readToDelimiter(delimiter: string, respectQuoted = false) {
    this.skipBlank()
    while (this.p < this.N) {
      if (respectQuoted && this.peekType() & QUOTE) {
        this.readQuoted()
        continue
      }
      ++this.p
      if (this.rmatch(delimiter)) return this.p
    }
    return -1
  }

  readOutputToken(options: NormalizedFullOptions = defaultOptions): OutputToken {
    const { file, input } = this
    const { outputDelimiterLeft, outputDelimiterRight, tagDelimiterLeft, tagDelimiterRight } = options
    const begin = this.p
    // the reference's modes read outputs as it does; `warn` keeps reading quoted text
    const reference = options.errorMode !== 'warn'
    if (reference) {
      // the reference ends an output where a tag opens: `{{ a{% b %}` is one token that fails to parse
      const from = begin + outputDelimiterLeft.length
      const close = input.indexOf(outputDelimiterRight, from)
      const tag = input.indexOf(tagDelimiterLeft, from)
      const tagEnd = tag === -1 ? -1 : input.indexOf(tagDelimiterRight, tag + tagDelimiterLeft.length)
      if (tagEnd !== -1 && (close === -1 || tag < close)) {
        this.p = tagEnd + tagDelimiterRight.length
        const token = new OutputToken(input, begin, this.p, options, file)
        token.terminated = false
        return token
      }
    }
    // the reference ends an output at the first delimiter, quoted or not
    if (this.readToDelimiter(outputDelimiterRight, !reference) === -1) {
      throw this.error(`Variable '${this.excerpt(begin)}' was not properly terminated with regexp: /\\}\\}/`, begin)
    }
    return new OutputToken(input, begin, this.p, options, file)
  }

  readEndrawOrRawContent(options: NormalizedFullOptions): HTMLToken | TagToken {
    const { tagDelimiterLeft, tagDelimiterRight } = options
    const begin = this.p
    let leftPos = this.readTo(tagDelimiterLeft) - tagDelimiterLeft.length
    while (this.p < this.N) {
      if (this.peek() === '-') this.p++
      const name = this.readIdentifier().getText()
      if (this.rawTagName === 'doc' && name === 'doc') {
        return this.unclosedRaw(begin, "Syntax Error in 'doc' - Nested doc tags are not allowed")
      }
      if (name !== 'end' + this.rawTagName) {
        leftPos = this.readTo(tagDelimiterLeft) - tagDelimiterLeft.length
        continue
      }
      while (this.p <= this.N) {
        if (this.rmatch(tagDelimiterRight)) {
          const end = this.p
          if (begin === leftPos) {
            this.rawBeginAt = -1
            return new TagToken(this.input, begin, end, options, this.file)
          } else {
            this.p = leftPos
            return new HTMLToken(this.input, begin, leftPos, this.file)
          }
        }
        if (this.rmatch(tagDelimiterLeft)) {
          leftPos = this.p - tagDelimiterLeft.length
          break
        }
        this.p++
      }
    }
    return this.unclosedRaw(begin, `'${this.rawTagName}' tag was never closed`)
  }

  /** The rest of the input is the raw body; the raw tag fails when it is parsed. */
  private unclosedRaw(begin: number, message: string): HTMLToken {
    malform(this.rawToken!, this.error(message, begin))
    this.rawBeginAt = -1
    this.p = this.N
    return new HTMLToken(this.input, begin, this.N, this.file)
  }

  readLiquidTagTokens(options: NormalizedFullOptions = defaultOptions): LiquidTagToken[] {
    const tokens: LiquidTagToken[] = []
    while (this.p < this.N) {
      const token = this.readLiquidTagToken(options)
      token && tokens.push(token)
    }
    return tokens
  }

  readLiquidTagToken(options: NormalizedFullOptions): LiquidTagToken | undefined {
    this.skipBlank()
    if (this.end()) return

    const begin = this.p
    this.readToDelimiter('\n')
    const end = this.p
    return new LiquidTagToken(this.input, begin, end, options, this.file)
  }

  error(msg: string, pos: number = this.p) {
    return new TokenizationError(msg, new IdentifierToken(this.input, pos, this.N, this.file))
  }

  assert(pred: unknown, msg: string | (() => string), pos?: number) {
    if (!pred) throw this.error(typeof msg === 'function' ? msg() : msg, pos)
  }

  excerpt(begin: number = this.p) {
    return ellipsis(this.input.slice(begin, this.N), 32)
  }

  snapshot(begin: number = this.p) {
    return JSON.stringify(ellipsis(this.input.slice(begin, this.N), 32))
  }

  /**
   * @deprecated use #readIdentifier instead
   */
  readWord() {
    return this.readIdentifier()
  }

  readIdentifier(): IdentifierToken {
    this.skipBlank()
    const begin = this.p
    while (!this.end() && isWord(this.peek())) ++this.p
    return new IdentifierToken(this.input, begin, this.p, this.file)
  }

  readNonEmptyIdentifier(): IdentifierToken | undefined {
    const id = this.readIdentifier()
    return id.size() ? id : undefined
  }

  readTagName(): string {
    this.skipBlank()
    // Handle inline comment tags
    if (this.input[this.p] === '#') return this.input.slice(this.p, ++this.p)
    return this.readIdentifier().getText()
  }

  readHashes(jekyllStyle?: boolean | string) {
    const hashes = []
    while (true) {
      const hash = this.readHash(jekyllStyle)
      if (!hash) return hashes
      hashes.push(hash)
    }
  }

  readHash(jekyllStyle?: boolean | string): HashToken | undefined {
    this.skipBlank()
    if (this.peek() === ',') ++this.p
    const begin = this.p
    const name = this.readNonEmptyIdentifier()
    if (!name) return
    let value

    this.skipBlank()
    const sep = isString(jekyllStyle) ? jekyllStyle : jekyllStyle ? '=' : ':'
    if (this.peek() === sep) {
      ++this.p
      value = this.readValue()
    }
    return new HashToken(this.input, begin, this.p, name, value, this.file)
  }

  remaining() {
    return this.input.slice(this.p, this.N)
  }

  advance(step = 1) {
    this.p += step
  }

  end() {
    return this.p >= this.N
  }
  read() {
    return this.input[this.p++]
  }
  readTo(end: string): number {
    while (this.p < this.N) {
      ++this.p
      if (this.rmatch(end)) return this.p
    }
    return -1
  }

  readValue(): ValueToken | undefined {
    this.skipBlank()
    const begin = this.p
    const variable = this.readLiteral() || this.readQuoted() || this.readRange() || this.readNumber()
    const props = this.readProperties(!variable)
    if (!props.length) return variable
    return new PropertyAccessToken(variable, props, this.input, begin, this.p)
  }

  readScopeValue(): ValueToken | undefined {
    this.skipBlank()
    const begin = this.p
    const props = this.readProperties()
    if (!props.length) return undefined
    return new PropertyAccessToken(undefined, props, this.input, begin, this.p)
  }

  private readProperties(isBegin = true): (ValueToken | IdentifierToken)[] {
    const props: (ValueToken | IdentifierToken)[] = []
    while (true) {
      // a lookup may be spaced from what it reads, as in `a . b`
      if (props.length) {
        const before = this.p
        this.skipBlank()
        if (this.peek() !== '[' && !(this.peek() === '.' && this.peek(1) !== '.')) this.p = before
      }
      if (this.peek() === '[') {
        this.p++
        const prop = this.readValue() || new IdentifierToken(this.input, this.p, this.p, this.file)
        if (this.exactBrackets) {
          this.skipBlank()
          this.assert(this.read() === ']', '[ not closed')
        } else this.assert(this.readTo(']') !== -1, '[ not closed')
        props.push(prop)
        continue
      }
      if (isBegin && !props.length) {
        const prop = this.readNonEmptyIdentifier()
        if (prop) {
          props.push(prop)
          continue
        }
      }
      if (this.peek() === '.' && this.peek(1) !== '.') {
        // skip range syntax
        this.p++
        const prop = this.readNonEmptyIdentifier()
        if (!prop) break
        props.push(prop)
        continue
      }
      break
    }
    return props
  }

  readNumber(): NumberToken | undefined {
    this.skipBlank()
    let decimalFound = false
    let digitFound = false
    let n = 0
    if (this.peekType() & SIGN) n++
    while (this.p + n <= this.N) {
      if (this.peekType(n) & NUMBER) {
        digitFound = true
        n++
      } else if (this.peek(n) === '.' && this.peek(n + 1) !== '.') {
        if (decimalFound || !digitFound) return
        decimalFound = true
        n++
      } else break
    }
    if (digitFound && !isWord(this.peek(n))) {
      const num = new NumberToken(this.input, this.p, this.p + n, this.file)
      this.advance(n)
      return num
    }
  }

  readLiteral(): LiteralToken | undefined {
    this.skipBlank()
    const end = this.matchTrie(this.literalTrie)
    if (end === -1) return
    // `blank.foo` looks up a variable named `blank`
    if (this.input[end] === '[' || (this.input[end] === '.' && this.input[end + 1] !== '.')) return
    const literal = new LiteralToken(this.input, this.p, end, this.file)
    this.p = end
    return literal
  }

  readRange(): RangeToken | undefined {
    this.skipBlank()
    const begin = this.p
    if (this.peek() !== '(') return
    ++this.p
    const lhs = this.readValueOrThrow()
    this.skipBlank()
    this.assert(this.read() === '.' && this.read() === '.' && this.peek() !== '.', 'invalid range syntax')
    const rhs = this.readValueOrThrow()
    this.skipBlank()
    this.assert(this.read() === ')', 'invalid range syntax')
    return new RangeToken(this.input, begin, this.p, lhs, rhs, this.file)
  }

  readValueOrThrow(): ValueToken {
    const value = this.readValue()
    this.assert(value, () => `unexpected token ${this.snapshot()}, value expected`)
    return value!
  }

  readQuoted(): QuotedToken | undefined {
    this.skipBlank()
    const begin = this.p
    if (!(this.peekType() & QUOTE)) return
    ++this.p
    while (this.p < this.N) {
      ++this.p
      if (this.input[this.p - 1] === this.input[begin]) break
    }
    return new QuotedToken(this.input, begin, this.p, this.file)
  }

  *readFileNameTemplate(options: NormalizedFullOptions): IterableIterator<TopLevelToken> {
    const { outputDelimiterLeft } = options
    const htmlStopStrings = [',', ' ', '\r', '\n', '\t', outputDelimiterLeft]
    const htmlStopStringSet = new Set(htmlStopStrings)
    // break on ',' and ' ', outputDelimiterLeft only stops HTML token
    while (this.p < this.N && !htmlStopStringSet.has(this.peek())) {
      yield this.match(outputDelimiterLeft) ? this.readOutputToken(options) : this.readHTMLToken(htmlStopStrings)
    }
  }

  match(word: string) {
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== this.input[this.p + i]) return false
    }
    return true
  }

  rmatch(pattern: string) {
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[pattern.length - 1 - i] !== this.input[this.p - 1 - i]) return false
    }
    return true
  }

  peekType(n = 0) {
    return this.p + n >= this.N ? 0 : TYPES[this.input.charCodeAt(this.p + n)]
  }

  peek(n = 0): string {
    return this.p + n >= this.N ? '' : this.input[this.p + n]
  }

  skipBlank() {
    while (this.peekType() & BLANK) ++this.p
  }
}

function malform(token: TagToken, error: TokenizationError, replace = false): TagToken {
  if (replace || !token.malformed) (token as { malformed?: TokenizationError }).malformed = error
  return token
}
