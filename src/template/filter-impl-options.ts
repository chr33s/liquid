import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { FilterToken, Token } from '../tokens'

export interface FilterImpl {
  context: Context
  token: FilterToken
  liquid: Liquid
  /**
   * The token the piped input was written as, when this filter is first in the
   * chain and the input came from a single literal. Lets a filter see how the
   * template spelled a number, which a host `Number` no longer records.
   */
  source?: Token
}

export type FilterHandler = (this: FilterImpl, value: any, ...args: any[]) => any

export interface FilterOptions {
  handler: FilterHandler
  raw: boolean
  /** Accepted argument count, excluding the piped input. */
  arity?: [min: number, max: number]
}

export type FilterImplOptions = FilterHandler | FilterOptions
