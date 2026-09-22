import { FilterImpl } from '../../template'
import { assert, isArray, isFunction, stringify, toValue } from '../../util'
import { escape } from '../html'
import { requireProvider } from '../../theme'
import { keywords } from './args'

function attrs(pairs: Array<[string, unknown]>): string {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && value !== false && value !== '')
    .map(([key, value]) => ` ${key}="${escape.call(undefined as never, stringify(value))}"`)
    .join('')
}

/** Joins truthy class names, accepting a list or a whitespace separated string. */
export function class_list(this: FilterImpl, v: unknown): string {
  const value = toValue(v)
  const names = isArray(value) ? value : stringify(value).split(/\s+/)
  return names
    .map(name => stringify(toValue(name)).trim())
    .filter(Boolean)
    .join(' ')
}

export function* time_tag(
  this: FilterImpl,
  v: unknown,
  format: unknown,
  ...args: unknown[]
): Generator<unknown, string, unknown> {
  const options = keywords(args)
  const date = siblingFilter(this, 'date')
  const text = stringify(yield date(v, format))
  const datetime = stringify(yield date(v, String(options.get('datetime') ?? '%Y-%m-%dT%H:%M:%SZ')))
  return `<time datetime="${escape.call(this, datetime)}">${escape.call(this, text)}</time>`
}

export function highlight(this: FilterImpl, v: unknown, term: unknown): string {
  const text = stringify(v)
  const needle = stringify(term)
  if (!needle) return text
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return text.replace(pattern, match => `<strong class="highlight">${match}</strong>`)
}

export function link_to(this: FilterImpl, v: unknown, url: unknown, title?: unknown): string {
  return `<a href="${escape.call(this, stringify(url))}"${attrs([['title', title]])}>${stringify(v)}</a>`
}

export function script_tag(this: FilterImpl, v: unknown): string {
  return `<script src="${escape.call(this, stringify(v))}" type="text/javascript"></script>`
}

export function stylesheet_tag(this: FilterImpl, v: unknown, media: unknown = 'all'): string {
  return `<link href="${escape.call(this, stringify(v))}" rel="stylesheet" type="text/css"${attrs([
    ['media', media]
  ])} />`
}

export function preload_tag(this: FilterImpl, v: unknown, as: unknown, ...args: unknown[]): string {
  const extra = [...keywords(args)]
  return `<link href="${escape.call(this, stringify(v))}" as="${escape.call(this, stringify(as))}" rel="preload"${attrs(
    extra
  )} />`
}

export function placeholder_svg_tag(this: FilterImpl, v: unknown, className?: unknown): string {
  const name = stringify(v)
  const cls = className === undefined ? 'placeholder-svg' : stringify(className)
  return `<svg class="${escape.call(this, cls)}" role="img" aria-label="${escape.call(
    this,
    name
  )}" viewBox="0 0 525.5 525.5"><title>${escape.call(this, name)}</title></svg>`
}

export function* inline_asset_content(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  const assets = requireProvider(
    this.context.theme.assets?.inlineAsset,
    'inline_asset_content',
    'no asset provider supplies theme asset contents',
    this.context.capabilities
  )
  const content = yield assets.call(this.context.theme.assets, stringify(v))
  return stringify(
    requireProvider(
      content,
      'inline_asset_content',
      'the asset provider returned no content',
      this.context.capabilities
    )
  )
}

export function* structured_data(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  const json = siblingFilter(this, 'json')
  return `<script type="application/ld+json">${escapeScriptBody(stringify(yield json(toValue(v))))}</script>`
}

/**
 * JSON escapes neither `<` nor `/`, so a value containing `</script>` would
 * close the element. The unicode escapes keep the payload valid JSON.
 */
function escapeScriptBody(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/**
 * Resolve another filter the way the render would, so a render-local override
 * applies here too and a missing one is a Liquid error, not a TypeError.
 */
function siblingFilter(filter: FilterImpl, name: string): (...args: unknown[]) => unknown {
  const options = filter.context.getFilter(name) ?? filter.liquid.filters[name]
  const handler = isFunction(options) ? options : options?.handler
  assert(isFunction(handler), () => `undefined filter: ${name}`)
  return (...args: unknown[]) => handler!.apply(filter, args as [unknown])
}
