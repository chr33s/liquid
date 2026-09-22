import * as htmlFilters from './html'
import * as mathFilters from './math'
import * as urlFilters from './url'
import * as arrayFilters from './array'
import * as dateFilters from './date'
import * as stringFilters from './string'
import * as base64Filters from './base64'
import misc from './misc'
import { FilterImplOptions, FilterOptions } from '../template'
import { filterSignatures } from './signatures'
import { isFunction } from '../util'

const implementations: Record<string, FilterImplOptions> = {
  ...htmlFilters,
  ...mathFilters,
  ...urlFilters,
  ...arrayFilters,
  ...dateFilters,
  ...stringFilters,
  ...base64Filters,
  ...misc
}

export const filters: Record<string, FilterImplOptions> = Object.fromEntries(
  Object.entries(implementations).map(([name, impl]) => [name, withSignature(name, impl)])
)

function withSignature(name: string, impl: FilterImplOptions): FilterImplOptions {
  const arity = filterSignatures[name]
  if (!arity) return impl
  const options: FilterOptions = isFunction(impl) ? { handler: impl, raw: false } : { ...impl }
  return { ...options, arity }
}
