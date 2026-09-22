import { FilterImpl } from '../../template'
import { isArray, isNil, isObject, stringify, toValue } from '../../util'
import { escape } from '../html'
import { handleize } from './string'
import { GAP_TITLE, requireProvider, type StoreProvider } from '../../theme'
import { keywords } from './args'

function store(filter: FilterImpl, capability: string): StoreProvider {
  return requireProvider(
    filter.context.theme.store,
    capability,
    'no store provider was configured',
    filter.context.capabilities
  )
}

/** Markup the platform owns is asked for by name and never reconstructed here. */
function* platformMarkup(filter: FilterImpl, name: string, args: unknown[]): Generator<unknown, string, unknown> {
  const provider = store(filter, name)
  const markup = yield requireProvider(
    provider.platformMarkup,
    name,
    `the store provider does not render ${name}`,
    filter.context.capabilities
  ).call(provider, name, args)
  return stringify(
    requireProvider(markup, name, `the store provider returned nothing for ${name}`, filter.context.capabilities)
  )
}

export function payment_button(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'payment_button', [toValue(v)])
}

export function payment_terms(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'payment_terms', [toValue(v)])
}

export function payment_type_svg_tag(
  this: FilterImpl,
  v: unknown,
  ...args: unknown[]
): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'payment_type_svg_tag', [toValue(v), ...args])
}

export function payment_type_img_url(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'payment_type_img_url', [toValue(v)])
}

export function login_button(this: FilterImpl, v: unknown, ...args: unknown[]): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'login_button', [toValue(v), ...args])
}

export function avatar(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'avatar', [toValue(v)])
}

export function currency_selector(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return platformMarkup(this, 'currency_selector', [toValue(v)])
}

export function default_errors(this: FilterImpl, v: unknown): string {
  const errors = toValue(v)
  if (isNil(errors)) return ''
  const messages = isArray(errors) ? errors : Object.values(errors as Record<string, unknown>).flat()
  if (!messages.length) return ''
  const items = messages.map(message => `<li>${escape.call(this, stringify(toValue(message)))}</li>`).join('')
  return `<ul class="errors">${items}</ul>`
}

export function default_pagination(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const paginate = toValue(v) as Record<string, any> | null
  if (!paginate || !isArray(paginate['parts'])) return ''
  const options = new Map([...keywords(args)].map(([key, value]) => [key, stringify(toValue(value))]))
  const link = (part: Record<string, unknown>, text: string) => {
    if (part['is_link']) {
      return `<span class="page"><a href="${escape.call(this, stringify(part['url']))}">${text}</a></span>`
    }
    // a gap carries the ellipsis title and no page of its own
    return text === GAP_TITLE ? `<span class="deco">${GAP_TITLE}</span>` : `<span class="page current">${text}</span>`
  }
  const out: string[] = []
  if (paginate['previous']) {
    out.push(
      `<span class="prev"><a href="${escape.call(this, stringify(paginate['previous'].url))}">${
        options.get('previous') ?? paginate['previous'].title
      }</a></span>`
    )
  }
  for (const part of paginate['parts'] as Array<Record<string, unknown>>) {
    out.push(link(part, stringify(part['title'])))
  }
  if (paginate['next']) {
    out.push(
      `<span class="next"><a href="${escape.call(this, stringify(paginate['next'].url))}">${
        options.get('next') ?? paginate['next'].title
      }</a></span>`
    )
  }
  return out.join('\n')
}

export function customer_login_link(this: FilterImpl, v: unknown): string {
  return anchor('/account/login', stringify(v))
}

export function customer_logout_link(this: FilterImpl, v: unknown): string {
  return anchor('/account/logout', stringify(v))
}

export function customer_register_link(this: FilterImpl, v: unknown): string {
  return anchor('/account/register', stringify(v))
}

export function link_to_tag(this: FilterImpl, v: unknown, tag: unknown): string {
  return anchor(`/collections/all/${handleize.call(this, tag)}`, stringify(v), `Show tag ${stringify(tag)}`)
}

export function* link_to_add_tag(this: FilterImpl, v: unknown, tag: unknown): Generator<unknown, string, unknown> {
  const current = yield* currentTags(this)
  const tags = [...new Set([...current, handleize.call(this, tag)])].sort()
  return anchor(`/collections/all/${tags.join('+')}`, stringify(v), `Show tag ${stringify(tag)}`)
}

export function* link_to_remove_tag(this: FilterImpl, v: unknown, tag: unknown): Generator<unknown, string, unknown> {
  const handle = handleize.call(this, tag)
  const tags = (yield* currentTags(this)).filter(item => item !== handle)
  return anchor(`/collections/all/${tags.join('+')}`, stringify(v), `Remove tag ${stringify(tag)}`)
}

export function link_to_type(this: FilterImpl, v: unknown): string {
  return anchor(url_for_type.call(this, v), stringify(v), stringify(v))
}

export function link_to_vendor(this: FilterImpl, v: unknown): string {
  return anchor(url_for_vendor.call(this, v), stringify(v), stringify(v))
}

export function url_for_type(this: FilterImpl, v: unknown): string {
  return `/collections/types?q=${encodeURIComponent(stringify(v))}`
}

export function url_for_vendor(this: FilterImpl, v: unknown): string {
  return `/collections/vendors?q=${encodeURIComponent(stringify(v))}`
}

export function within(this: FilterImpl, v: unknown, collection: unknown): string {
  const handle = stringify(toValue((toValue(collection) as Record<string, unknown> | null)?.['handle'] ?? collection))
  const url = stringify(toValue(v))
  return handle ? `/collections/${handle}${url.startsWith('/') ? url : `/${url}`}` : url
}

export function sort_by(this: FilterImpl, v: unknown, order: unknown): string {
  const url = stringify(toValue(v))
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}sort_by=${encodeURIComponent(stringify(order))}`
}

export function* highlight_active_tag(
  this: FilterImpl,
  v: unknown,
  cssClass?: unknown
): Generator<unknown, string, unknown> {
  const tag = stringify(toValue(v))
  const name = cssClass === undefined ? 'active' : stringify(cssClass)
  return (yield* currentTags(this)).includes(handleize.call(this, tag))
    ? `<span class="${escape.call(this, name)}">${escape.call(this, tag)}</span>`
    : tag
}

export function item_count_for_variant(this: FilterImpl, v: unknown, variantId: unknown): number {
  const cart = toValue(v) as Record<string, unknown> | null
  const items = cart?.['items']
  if (!isArray(items)) return 0
  const id = toValue(variantId)
  return items
    .filter(item => equalsId(toValue((item as Record<string, unknown>)['variant_id']), id))
    .reduce((count, item) => count + Number(toValue((item as Record<string, unknown>)['quantity']) ?? 0), 0)
}

export function line_items_for(this: FilterImpl, v: unknown, subject: unknown): unknown[] {
  const cart = toValue(v) as Record<string, unknown> | null
  const items = cart?.['items']
  if (!isArray(items)) return []
  const target = toValue(subject)
  if (!isObject(target)) return []
  const key = 'variants' in target ? 'product_id' : 'variant_id'
  const id = toValue((target as Record<string, unknown>)['id'])
  return items.filter(item => equalsId(toValue((item as Record<string, unknown>)[key]), id))
}

function equalsId(left: unknown, right: unknown): boolean {
  return stringify(left) === stringify(right)
}

function* currentTags(filter: FilterImpl): Generator<unknown, string[], unknown> {
  // an optional platform variable: its absence is not a strict-variable error
  const current = yield filter.context._get(['current_tags'], false)
  return isArray(current) ? current.map(tag => handleize.call(filter, tag)) : []
}

function anchor(url: string, text: string, title?: string): string {
  const attrs = title === undefined ? '' : ` title="${escape.call(undefined as never, title)}"`
  return `<a href="${escape.call(undefined as never, url)}"${attrs}>${text}</a>`
}
