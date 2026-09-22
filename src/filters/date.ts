import { isDecimal } from '../drop/float-drop'
import { assert, toValue, stringify, isString, isNumber, LiquidDate, strftime, isNil } from '../util'
import { FilterImpl } from '../template'
import { NormalizedFullOptions } from '../liquid-options'

export function date(this: FilterImpl, v: string | Date, format?: string, timezoneOffset?: number | string) {
  const given = toValue(format)
  const fallback = this.context.opts.dateFormat
  // an empty or nil format returns the input untouched; an omitted one falls
  // back to the configured `dateFormat`, and is an error when that is unset
  const omitted = arguments.length < 2
  assert(!omitted || fallback !== '', 'date filter requires a format')
  if (!omitted && isNil(given)) return v
  const pattern = omitted ? fallback : stringify(given)
  if (pattern === '') return v
  const date = parseDate(v, this.context.opts, timezoneOffset)
  if (!date) return v
  return strftime(date, pattern)
}

function parseDate(
  v: string | Date,
  opts: NormalizedFullOptions,
  timezoneOffset?: number | string
): LiquidDate | undefined {
  let date: LiquidDate | undefined
  const defaultTimezoneOffset = timezoneOffset ?? opts.timezoneOffset
  const locale = opts.locale
  const decimal = isDecimal(v)
  v = toValue(v)
  // as the reference's `to_date`, only an integer is a timestamp, and a decimal is no date at all
  if (isNil(v) || decimal) {
    return undefined
  } else if (isString(v) && /^(now|today)$/i.test(v)) {
    date = new LiquidDate(Date.now(), locale, defaultTimezoneOffset)
  } else if (isNumber(v)) {
    date = new LiquidDate(v * 1000, locale, defaultTimezoneOffset)
  } else if (isString(v)) {
    if (/^\d+$/.test(v)) {
      date = new LiquidDate(+v * 1000, locale, defaultTimezoneOffset)
    } else if ((opts.preserveTimezones ?? opts.timezoneOffset === undefined) && timezoneOffset === undefined) {
      date = LiquidDate.createDateFixedToTimezone(v, locale)
    } else {
      date = new LiquidDate(v, locale, defaultTimezoneOffset)
    }
  } else if (v instanceof Date) {
    date = new LiquidDate(v, locale, defaultTimezoneOffset)
  } else {
    // as the reference, a value that is no date, string or number is not converted
    return undefined
  }
  return date.valid() ? date : undefined
}
