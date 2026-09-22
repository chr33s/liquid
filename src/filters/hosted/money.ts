import { FilterImpl } from '../../template'
import { stringify, toNumber, toValue } from '../../util'
import type { LocaleBundle } from '../../theme'

const DEFAULT_FORMAT = '${{amount}}'
const DEFAULT_WITH_CURRENCY = '${{amount}} USD'

function locale(filter: FilterImpl): LocaleBundle {
  const { theme } = filter.context
  const name = theme.locale ?? filter.context.opts.locale
  return theme.locales?.[name] ?? theme.locales?.[name?.split('-')[0] ?? ''] ?? {}
}

/** Amounts arrive in the shop's minor units, as the hosted objects supply them. */
function amounts(cents: number): Record<string, string> {
  const value = cents / 100
  const grouped = (digits: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return {
    amount: grouped(2),
    amount_no_decimals: grouped(0),
    amount_with_comma_separator: swapSeparators(grouped(2)),
    amount_no_decimals_with_comma_separator: grouped(0).replace(/,/g, '.'),
    amount_with_space_separator: grouped(2).replace(/,/g, ' ').replace(/\./g, ','),
    amount_no_decimals_with_space_separator: grouped(0).replace(/,/g, ' '),
    amount_with_apostrophe_separator: grouped(2).replace(/,/g, "'")
  }
}

/** Swaps the thousands and decimal separators, e.g. 1,234.56 to 1.234,56. */
function swapSeparators(value: string): string {
  return value.replace(/[,.]/g, match => (match === ',' ? '.' : ','))
}

function render(format: string, cents: number): string {
  const table = amounts(cents)
  return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(table, name) ? table[name] : match
  )
}

export function money(this: FilterImpl, v: unknown): string {
  return render(locale(this).moneyFormat ?? DEFAULT_FORMAT, toNumber(toValue(v)))
}

export function money_with_currency(this: FilterImpl, v: unknown): string {
  return render(locale(this).moneyWithCurrencyFormat ?? DEFAULT_WITH_CURRENCY, toNumber(toValue(v)))
}

export function money_without_currency(this: FilterImpl, v: unknown): string {
  return amounts(toNumber(toValue(v))).amount
}

export function money_without_trailing_zeros(this: FilterImpl, v: unknown): string {
  const cents = toNumber(toValue(v))
  const format = locale(this).moneyFormat ?? DEFAULT_FORMAT
  return cents % 100 === 0
    ? render(format.replace(/\{\{\s*amount\s*\}\}/g, '{{amount_no_decimals}}'), cents)
    : render(format, cents)
}

export function weight_with_unit(this: FilterImpl, v: unknown, unit?: unknown): string {
  const grams = toNumber(toValue(v))
  const target = unit === undefined ? 'g' : stringify(unit)
  const conversions = new Map([
    ['g', 1],
    ['kg', 1000],
    ['oz', 28.349523125],
    ['lb', 453.59237]
  ])
  const factor = conversions.get(target)
  if (factor === undefined) return `${grams} g`
  const value = grams / factor
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${target}`
}

export function unit_price_with_measurement(this: FilterImpl, v: unknown, measurement: unknown): string {
  const price = money.call(this, v)
  const spec = toValue(measurement) as Record<string, unknown> | null
  if (!spec) return price
  const quantity = toNumber(toValue(spec['quantity_value'])) || 1
  const unit = stringify(toValue(spec['quantity_unit']))
  return quantity === 1 ? `${price}/${unit}` : `${price}/${quantity} ${unit}`
}
