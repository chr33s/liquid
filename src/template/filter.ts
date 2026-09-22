import { evalToken } from '../render'
import { Context } from '../context'
import { identify, isFunction } from '../util/underscore'
import { assert } from '../util/assert'
import { FilterHandler, FilterImplOptions } from './filter-impl-options'
import { FilterArg, isKeyValuePair } from '../parser/filter-arg'
import { Liquid } from '../liquid'
import { FilterToken, Token } from '../tokens'

export class Filter {
  public name: string
  public args: FilterArg[]
  public readonly raw: boolean
  private readonly fixed?: FilterImplOptions
  private liquid: Liquid
  private token: FilterToken
  private readonly source?: Token

  public constructor(token: FilterToken, options: FilterImplOptions | undefined, liquid: Liquid, source?: Token) {
    this.token = token
    this.source = source
    this.name = token.name
    this.fixed = options
    const registered = options ?? liquid?.filters?.[token.name]
    this.raw = !isFunction(registered) && !!registered?.raw
    this.args = token.args
    this.liquid = liquid
  }
  public *render(value: any, context: Context, outputEscape?: Filter): IterableIterator<unknown> {
    const argv: any[] = []
    for (const arg of this.args as FilterArg[]) {
      if (isKeyValuePair(arg)) argv.push([arg[0], yield evalToken(arg[1], context)])
      // a given argument that reads nothing is nil, never an omitted one taking its default
      else argv.push((yield evalToken(arg, context)) ?? null)
    }
    const options = this.optionsFor(context)
    // a core filter takes its keyword arguments as one trailing hash, as the reference passes them
    const keyword = (i: number) => isKeyValuePair(this.args[i])
    if (!isFunction(options) && options?.arity && this.args.some(arg => isKeyValuePair(arg))) {
      const hash = Object.fromEntries(argv.filter((_, i) => keyword(i)))
      argv.splice(0, argv.length, ...argv.filter((_, i) => !keyword(i)), hash)
    }
    this.assertArity(options, argv.length)
    const raw = !isFunction(options) && !!options?.raw
    const result = yield handlerOf(options).apply(
      { context, token: this.token, liquid: this.liquid, source: this.source },
      [value, ...argv]
    )
    return outputEscape && !raw ? yield outputEscape.render(result, context) : result
  }
  private assertArity(options: FilterImplOptions | undefined, given: number) {
    const arity = isFunction(options) ? undefined : options?.arity
    if (!arity) return
    const [min, max] = arity
    assert(
      given >= min && given <= max,
      // counted as the reference counts them, the piped input included
      () => `wrong number of arguments (given ${given + 1}, expected ${describeArity(min + 1, max + 1)})`
    )
  }
  /**
   * Filters resolve per render, so one parsed template can serve renders with
   * different registries and different `strictFilters` policies.
   */
  private optionsFor(context: Context): FilterImplOptions | undefined {
    const options = this.fixed ?? context.getFilter(this.name) ?? this.liquid?.filters?.[this.name]
    assert(options || !context.strictFilters, () => `undefined filter: ${this.name}`)
    return options
  }
}

function handlerOf(options: FilterImplOptions | undefined): FilterHandler {
  return isFunction(options) ? options : isFunction(options?.handler) ? options!.handler : identify
}

function describeArity(min: number, max: number): string {
  return min === max ? String(min) : `${min}..${max}`
}
