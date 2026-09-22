import { Filter } from './filter'
import { Expression, isTruthy, type BinaryOperatorHandler } from '../render'
import { assert } from '../util/assert'
import type { LaxMarkup } from '../parser/lax'
import { Tokenizer } from '../parser'
import type { FilteredValueToken, Token } from '../tokens'
import type { Liquid } from '../liquid'
import type { Context } from '../context'

export class Value {
  public readonly filters: Filter[] = []
  public readonly initial: Expression

  /**
   * @param input the value to be valuated, eg.: "foobar" | truncate: 3
   */
  public constructor(input: string | FilteredValueToken, liquid: Liquid) {
    const token: FilteredValueToken =
      typeof input === 'string' ? new Tokenizer(input, liquid.options.operators).readFilteredValue() : input
    this.initial = token.initial
    this.filters = token.filters.map(
      (filterToken, index) =>
        new Filter(filterToken, undefined, liquid, index === 0 ? literalOf(token.initial) : undefined)
    )
  }

  public *value(ctx: Context, lenient?: boolean, outputEscape?: Filter): Generator<unknown, unknown, unknown> {
    lenient = lenient || (ctx.opts.lenientIf && this.filters.length > 0 && this.filters[0].name === 'default')
    let val = yield this.initial.evaluate(ctx, lenient)

    for (let i = 0; i < this.filters.length; i++) {
      val = yield this.filters[i].render(val, ctx, i === this.filters.length - 1 ? outputEscape : undefined)
    }
    if (!this.filters.length && outputEscape) return yield outputEscape.render(val, ctx)
    return val
  }
}

/** The single token an expression consists of, when it is just one literal. */
function literalOf(expression: Expression): Token | undefined {
  return expression.postfix.length === 1 ? expression.postfix[0] : undefined
}

/**
 * A condition as the reference's lax parser reads it: comparisons evaluated
 * left to right, each stopping the chain when its `or` holds or its `and`
 * fails. An operator the reference does not know is an error when reached.
 */
export class LaxCondition extends Value {
  private readonly comparisons: { left: Value; operator?: string; right: Value }[]
  public constructor(
    private readonly condition: NonNullable<LaxMarkup['condition']>,
    liquid: Liquid
  ) {
    super('nil', liquid)
    this.comparisons = condition.comparisons.map(({ left, operator, right }) => ({
      left: new Value(left, liquid),
      operator,
      right: new Value(right, liquid)
    }))
  }
  public *value(ctx: Context, lenient?: boolean): Generator<unknown, unknown, unknown> {
    let result: unknown
    for (let i = 0; i < this.comparisons.length; i++) {
      const { left, operator, right } = this.comparisons[i]
      const l = yield left.value(ctx, lenient)
      if (operator === undefined) result = l
      else {
        const handler = ctx.opts.operators[operator]
        assert(handler, () => `Unknown operator ${operator}`)
        result = yield (handler as BinaryOperatorHandler)(l, yield right.value(ctx, lenient), ctx)
      }
      const relation = this.condition.relations[i]
      if (relation === 'or' && isTruthy(result, ctx)) break
      if (relation === 'and' && !isTruthy(result, ctx)) break
    }
    return result
  }
}
