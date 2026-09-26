import * as _ from './underscore'
import { Token } from '../tokens/token'
import { Template } from '../template/template'

export abstract class LiquidError extends Error {
  public abstract readonly code: string
  public token!: Token
  public context = ''
  public originalError?: Error
  public constructor(err: Error | string, token: Token) {
    super(typeof err === 'string' ? err : err.message)
    if (typeof err !== 'string') Object.defineProperty(this, 'originalError', { value: err, enumerable: false })
    Object.defineProperty(this, 'token', { value: token, enumerable: false })
  }
  protected update() {
    Object.defineProperty(this, 'context', { value: mkContext(this.token), enumerable: false })
    this.message = mkMessage(this.message, this.token)
    this.stack = this.message + '\n' + this.context + '\n' + this.stack
    if (this.originalError) this.stack += '\nFrom ' + this.originalError.stack
  }
  static is(obj: unknown): obj is LiquidError {
    return obj instanceof LiquidError
  }
}

export class TokenizationError extends LiquidError {
  public readonly code = 'TOKENIZATION_ERROR'
  public constructor(message: string, token: Token) {
    super(message, token)
    this.name = 'TokenizationError'
    super.update()
  }
}

export class ParseError extends LiquidError {
  public readonly code = 'PARSE_ERROR'
  public constructor(err: Error, token: Token) {
    super(err, token)
    this.name = 'ParseError'
    this.message = err.message
    super.update()
  }
}

export class RenderError extends LiquidError {
  public readonly code = 'RENDER_ERROR'
  public constructor(err: Error, tpl: Template) {
    super(err, tpl.token)
    this.name = 'RenderError'
    this.message = err.message
    super.update()
  }
  public static is(obj: unknown): obj is RenderError {
    return obj instanceof RenderError
  }
}

export class LiquidErrors extends LiquidError {
  public readonly code = 'LIQUID_ERRORS'
  public constructor(public errors: LiquidError[]) {
    super(errors[0], errors[0].token)
    this.name = 'LiquidErrors'
    const s = errors.length > 1 ? 's' : ''
    this.message = `${errors.length} error${s} found`
    super.update()
  }
  public static is(obj: unknown): obj is LiquidErrors {
    return obj instanceof LiquidErrors
  }
}

export class UndefinedVariableError extends LiquidError {
  public readonly code = 'UNDEFINED_VARIABLE'
  public constructor(err: Error, token: Token) {
    super(err, token)
    this.name = 'UndefinedVariableError'
    this.message = err.message
    super.update()
  }
}

export class LiquidOptionError extends Error {
  public readonly code = 'OPTION_ERROR'
  public constructor(message: string) {
    super(message)
    this.name = 'LiquidOptionError'
  }
  static is(obj: unknown): obj is LiquidOptionError {
    return obj instanceof LiquidOptionError
  }
}

export class LiquidLimitError extends Error {
  public readonly code = 'LIMIT_EXCEEDED'
  public constructor(message: string) {
    super(message)
    this.name = 'LiquidLimitError'
  }
  static is(obj: unknown): obj is LiquidLimitError {
    return obj instanceof LiquidLimitError
  }
}

export class LiquidLookupError extends Error {
  public readonly code = 'ENOENT'
  public constructor(message: string) {
    super(message)
    this.name = 'LiquidLookupError'
  }
  static is(obj: unknown): obj is LiquidLookupError {
    return obj instanceof LiquidLookupError
  }
}

/** Template, option, limit, and lookup failures. Narrow with {@link isLiquidFailure}. Lookup failures keep `code` set to `ENOENT`. */
export type LiquidFailure =
  | TokenizationError
  | ParseError
  | RenderError
  | UndefinedVariableError
  | LiquidErrors
  | LiquidOptionError
  | LiquidLimitError
  | LiquidLookupError

export function isLiquidFailure(error: unknown): error is LiquidFailure {
  return (
    LiquidError.is(error) ||
    error instanceof LiquidOptionError ||
    error instanceof LiquidLimitError ||
    error instanceof LiquidLookupError
  )
}

// only used internally; raised where we don't have token information,
// so it can't be an UndefinedVariableError.
export class InternalUndefinedVariableError extends Error {
  variableName: string

  public constructor(variableName: string) {
    super(`undefined variable: ${variableName}`)
    this.name = 'InternalUndefinedVariableError'
    this.variableName = variableName
  }

  static is(obj: unknown): obj is InternalUndefinedVariableError {
    return obj instanceof InternalUndefinedVariableError
  }
}

export class AssertionError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
    this.message = message + ''
  }
}

function mkContext(token: Token) {
  const [line, col] = token.getPosition()
  const lines = token.input.split('\n')
  const begin = Math.max(line - 2, 1)
  const end = Math.min(line + 3, lines.length)

  const context = _.range(begin, end + 1)
    .map(lineNumber => {
      const rowIndicator = lineNumber === line ? '>> ' : '   '
      const num = _.padStart(String(lineNumber), String(end).length)
      let text = `${rowIndicator}${num}| `

      const colIndicator = lineNumber === line ? '\n' + _.padStart('^', col + text.length) : ''

      text += lines[lineNumber - 1]
      text += colIndicator
      return text
    })
    .join('\n')

  return context
}

function mkMessage(msg: string, token: Token) {
  if (token.file) msg += `, file:${token.file}`
  const [line, col] = token.getPosition()
  msg += `, line:${line}, col:${col}`
  return msg
}
