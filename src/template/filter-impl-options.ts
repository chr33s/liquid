import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { FilterToken } from '../tokens'

export interface FilterImpl {
  context: Context
  token: FilterToken
  liquid: Liquid
}

export type FilterHandler = (this: FilterImpl, value: any, ...args: any[]) => any

export interface FilterOptions {
  handler: FilterHandler
  raw: boolean
  /** When `lenientIf` is set, undefined variables passed to this filter evaluate to null instead of throwing. */
  lenient?: boolean
}

export type FilterImplOptions = FilterHandler | FilterOptions
