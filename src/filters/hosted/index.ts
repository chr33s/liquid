import * as cryptoFilters from './crypto'
import * as stringFilters from './string'
import * as colorFilters from './color'
import * as htmlFilters from './html'
import * as localizationFilters from './localization'
import * as moneyFilters from './money'
import * as dateFilters from './date'
import * as assetFilters from './asset'
import * as commerceFilters from './commerce'
import { json } from './json'
import type { FilterImplOptions } from '../../template'

/**
 * Names documented for the hosted theme dialect and implemented without a
 * platform provider. Provider-backed names are registered separately so that a
 * missing provider is reported rather than silently returning an empty string.
 */
export const hostedFilters: Record<string, FilterImplOptions> = {
  ...cryptoFilters,
  ...stringFilters,
  ...colorFilters,
  ...htmlFilters,
  ...localizationFilters,
  ...moneyFilters,
  ...dateFilters,
  ...assetFilters,
  ...commerceFilters,
  json
}

export * from './color-space'
export { blake3 as blake3Bytes } from './blake3'
export { md5 as md5Bytes } from './md5'
