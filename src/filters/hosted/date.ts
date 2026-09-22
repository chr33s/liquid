import { FilterImpl } from '../../template'
import { isNil, stringify, toValue } from '../../util'
import { date as coreDate } from '../date'

/** The formats the hosted dialect ships before a theme adds its own. */
const BUILT_IN_FORMATS: ReadonlyMap<string, string> = new Map([
  ['abbreviated_date', '%b %d, %Y'],
  ['basic', '%m/%d/%Y'],
  ['date', '%B %d, %Y'],
  ['date_at_time', '%B %d, %Y at %l:%M %p'],
  ['default', '%a, %b %d, %y, %l:%M %p'],
  ['month_day_year', '%B %d, %Y'],
  ['on_date', 'on %b %d, %Y']
])

/**
 * The hosted `date`, which also accepts `format:` naming a locale format.
 */
export function date(this: FilterImpl, v: unknown, ...args: unknown[]): unknown {
  const keyword = args.find(arg => Array.isArray(arg) && arg[0] === 'format') as [string, unknown] | undefined
  if (keyword) {
    const name = stringify(toValue(keyword[1]))
    const bundleName = this.context.theme.locale ?? this.context.opts.locale
    const bundle =
      this.context.theme.locales?.[bundleName] ?? this.context.theme.locales?.[bundleName?.split('-')[0] ?? '']
    const configured = bundle?.dateFormats
    const pattern =
      (configured && Object.prototype.hasOwnProperty.call(configured, name) ? configured[name] : undefined) ??
      BUILT_IN_FORMATS.get(name)
    if (pattern === undefined) {
      this.context.capabilities.record('date.format', 'provider_required', `no locale format named "${name}"`)
      return v
    }
    return coreDate.call(this, v as string, pattern)
  }
  const positional = args.filter(arg => !Array.isArray(arg))
  if (positional.length === 0) return coreDate.call(this, v as string)
  const [pattern, timezone] = positional
  return coreDate.call(this, v as string, isNil(pattern) ? undefined : stringify(toValue(pattern)), timezone as never)
}
