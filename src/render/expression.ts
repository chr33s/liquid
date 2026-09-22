import {
  QuotedToken,
  RangeToken,
  OperatorToken,
  Token,
  PropertyAccessToken,
  IdentifierToken,
  OperatorType,
  operatorTypes
} from '../tokens'
import {
  isRangeToken,
  isPropertyAccessToken,
  UndefinedVariableError,
  LiquidRange,
  isOperatorToken,
  isNumberToken,
  toValue,
  toNumber,
  assert
} from '../util'
import type { Context } from '../context'
import { defaultOperators, isTruthy, type UnaryOperatorHandler } from '../render'
import { Drop, ofKind, isDecimal } from '../drop'

type ExpressionNode = { token: Token } | { operator: OperatorToken; lhs?: ExpressionNode; rhs: ExpressionNode }

function isOperatorNode(
  node: ExpressionNode
): node is { operator: OperatorToken; lhs?: ExpressionNode; rhs: ExpressionNode } {
  return 'operator' in node
}

export class Expression {
  readonly postfix: Token[]
  /**
   * False when the tokens reduce to more than one value, or an operator lacks
   * an operand, i.e. the source held markup the grammar does not join into a
   * single expression.
   */
  readonly complete: boolean
  /** False when the tokens reduce to more than one value. */
  readonly single: boolean
  private readonly root?: ExpressionNode

  public constructor(tokens: IterableIterator<Token>) {
    this.postfix = [...toPostfix(tokens)]
    const { roots, operandsMissing } = toTree(this.postfix)
    this.root = roots[0]
    this.single = roots.length <= 1
    this.complete = this.single && !operandsMissing
  }
  public *evaluate(ctx: Context, lenient?: boolean): Generator<unknown, unknown, unknown> {
    assert(ctx, 'unable to evaluate: context not defined')
    if (!this.root) return undefined
    return yield evalNode(this.root, ctx, lenient)
  }
  public valid() {
    return !!this.postfix.length
  }
}

function* evalNode(node: ExpressionNode, ctx: Context, lenient?: boolean): Generator<unknown, unknown, unknown> {
  if (!isOperatorNode(node)) return yield evalToken(node.token, ctx, lenient)
  const { operator, lhs, rhs } = node
  const handler = ctx.opts.operators[operator.operator]
  if (operatorTypes[operator.operator] === OperatorType.Unary) {
    return yield (handler as UnaryOperatorHandler)(yield evalNode(rhs, ctx, lenient), ctx)
  }
  // a binary operator whose left operand is missing keeps its two-operand
  // signature, so a handler is never handed the context where a value goes
  const l = lhs === undefined ? undefined : yield evalNode(lhs, ctx, lenient)
  // `and`/`or` are short-circuiting: the right operand is only evaluated when
  // the left one does not already decide the result. A replaced operator keeps
  // the eager contract of its two-operand signature.
  if (handler === defaultOperators[operator.operator]) {
    if (operator.operator === 'and' && !isTruthy(toValue(l), ctx)) return false
    if (operator.operator === 'or' && isTruthy(toValue(l), ctx)) return true
  }
  return yield handler(l, yield evalNode(rhs, ctx, lenient), ctx)
}

function toTree(postfix: Token[]): { roots: ExpressionNode[]; operandsMissing: boolean } {
  const operands: ExpressionNode[] = []
  let operandsMissing = false
  for (const token of postfix) {
    if (isOperatorToken(token)) {
      const rhs = operands.pop()
      if (rhs === undefined) {
        operandsMissing = true
        continue
      }
      const unary = operatorTypes[token.operator] === OperatorType.Unary
      const lhs = unary ? undefined : operands.pop()
      if (!unary && lhs === undefined) operandsMissing = true
      operands.push({ operator: token, lhs, rhs })
    } else operands.push({ token })
  }
  return { roots: operands, operandsMissing }
}

export function* evalToken(token: Token | undefined, ctx: Context, lenient = false): IterableIterator<unknown> {
  if (!token) return
  if (isNumberToken(token)) {
    const text = token.getText()
    // an integer past 2**53 keeps its digits, as the reference's integers do
    if (!text.includes('.') && !Number.isSafeInteger(token.content)) return BigInt(text)
    return ofKind(token.content, text.includes('.'))
  }
  if ('content' in token) return token.content
  if (isPropertyAccessToken(token)) return yield evalPropertyAccessToken(token, ctx, lenient)
  if (isRangeToken(token)) return yield evalRangeToken(token, ctx)
}

function* evalPropertyAccessToken(
  token: PropertyAccessToken,
  ctx: Context,
  lenient: boolean
): IterableIterator<unknown> {
  const props: (string | number | Drop)[] = []
  // `a.first` asks for a command, `a["first"]` only for a key
  const bracketed: boolean[] = []
  for (const prop of token.props) {
    props.push((yield evalToken(prop, ctx, false)) as unknown as string | number | Drop)
    bracketed.push(!(prop instanceof IdentifierToken))
  }
  try {
    if (token.variable) {
      const variable = yield evalToken(token.variable, ctx, lenient)
      return yield ctx._getFromScope(variable, props, ctx.strictVariables, bracketed)
    } else {
      return yield ctx._get(props, ctx.strictVariables, bracketed)
    }
  } catch (e) {
    if (lenient && (e as Error).name === 'InternalUndefinedVariableError') return null
    throw new UndefinedVariableError(e as Error, token)
  }
}

export function evalQuotedToken(token: QuotedToken) {
  return token.content
}

function* evalRangeToken(token: RangeToken, ctx: Context) {
  const low = rangeBound(yield evalToken(token.lhs, ctx))
  const high = rangeBound(yield evalToken(token.rhs, ctx))
  return LiquidRange.fromBounds(low, high)
}

/** The reference reads a nil or string bound by its integer prefix, and rejects a decimal one. */
function rangeBound(value: unknown): number {
  assert(typeof toValue(value) === 'string' || !isDecimal(value), 'invalid integer')
  value = toValue(value)
  if (typeof value === 'number') return value
  if (value === null || value === undefined || typeof value === 'string')
    return toNumber(String(value ?? '').split('.')[0])
  if (typeof value === 'bigint') return Number(value)
  throw new Error('invalid integer')
}

function* toPostfix(tokens: IterableIterator<Token>): IterableIterator<Token> {
  const ops: OperatorToken[] = []
  for (const token of tokens) {
    if (isOperatorToken(token)) {
      while (ops.length && ops[ops.length - 1].getPrecedence() > token.getPrecedence()) {
        yield ops.pop()!
      }
      ops.push(token)
    } else yield token
  }
  while (ops.length) {
    yield ops.pop()!
  }
}
