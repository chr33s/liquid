import { FilterImpl } from '../../template'
import { isNil, stringify, toValue } from '../../util'
import type { LocaleBundle } from '../../theme'
import { keywords } from './args'

function bundle(filter: FilterImpl): LocaleBundle | undefined {
  const { theme } = filter.context
  const locale = theme.locale ?? filter.context.opts.locale
  return theme.locales?.[locale] ?? theme.locales?.[locale?.split('-')[0] ?? ''] ?? undefined
}

function own(node: unknown, key: string): unknown {
  if (node === null || typeof node !== 'object') return undefined
  if (!Object.prototype.hasOwnProperty.call(node, key)) return undefined
  return (node as Record<string, unknown>)[key]
}

function lookup(translations: Record<string, unknown> | undefined, key: string): unknown {
  if (!translations) return undefined
  const flat = own(translations, key)
  if (flat !== undefined) return flat
  let node: unknown = translations
  for (const part of key.split('.')) {
    node = own(node, part)
    if (node === undefined) return undefined
  }
  return node
}

/**
 * Looks a translation key up in the active locale, interpolating `{{ name }}`
 * placeholders from the keyword arguments. A missing key reports itself.
 */
export function translate(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const key = stringify(v)
  const options = keywords(args)
  const translations = bundle(this)?.translations
  let found = lookup(translations, key)

  const count = options.get('count')
  if (found !== null && typeof found === 'object' && !isNil(count)) {
    const form = Number(toValue(count)) === 1 ? 'one' : 'other'
    found = own(found, form) ?? own(found, 'other')
  }

  if (isNil(found) || typeof found === 'object' || typeof found === 'function') {
    this.context.capabilities.record('translate', 'provider_required', `no translation for "${key}"`)
    return `translation missing: ${key}`
  }

  return stringify(found).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    options.has(name) ? stringify(toValue(options.get(name))) : match
  )
}

export function t(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  return translate.call(this, v, ...args)
}

/** Renders an address using the locale's ordering, falling back to a plain list. */
export function format_address(this: FilterImpl, v: unknown): string {
  const address = toValue(v)
  if (address === null || typeof address !== 'object') return ''
  const fields = ['company', 'address1', 'address2', 'city', 'province', 'zip', 'country']
  const record = address as Record<string, unknown>
  return fields
    .map(field => stringify(toValue(record[field])).trim())
    .filter(Boolean)
    .map(line => `<p>${line}</p>`)
    .join('\n')
}
