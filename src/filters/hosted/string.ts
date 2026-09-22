import { FilterImpl } from '../../template'
import { stringify, toValue } from '../../util'

/**
 * A Shopify handle: lowercase, accents folded, runs of anything else collapsed
 * into a single hyphen, no leading or trailing hyphen.
 */
export function handleize(this: FilterImpl, v: unknown): string {
  return stringify(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function handle(this: FilterImpl, v: unknown): string {
  return handleize.call(this, v)
}

export function camelize(this: FilterImpl, v: unknown): string {
  return stringify(v)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

export function pluralize(this: FilterImpl, v: unknown, singular: unknown, plural: unknown): string {
  return Number(toValue(v)) === 1 ? stringify(singular) : stringify(plural)
}

/** Escapes a string for use in a URL path or query value. */
export function url_escape(this: FilterImpl, v: unknown): string {
  return encodeURI(stringify(v)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/** Escapes a string for use as a single URL parameter, spaces included. */
export function url_param_escape(this: FilterImpl, v: unknown): string {
  return encodeURIComponent(stringify(v)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}
