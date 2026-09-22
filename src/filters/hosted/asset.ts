import { FilterImpl } from '../../template'
import { isNil, stringify, toValue } from '../../util'
import { escape } from '../html'
import { requireProvider, type AssetProvider } from '../../theme'
import { keywords } from './args'

/** The keyword arguments of a filter call, as a plain options object. */
function optionsOf(args: unknown[]): Record<string, unknown> {
  return Object.fromEntries([...keywords(args)].map(([key, value]) => [key, toValue(value)]))
}

function provider(filter: FilterImpl, capability: string, member: keyof AssetProvider) {
  const assets = filter.context.theme.assets
  const fn = requireProvider(
    assets?.[member],
    capability,
    `no asset provider implements ${String(member)}`,
    filter.context.capabilities
  )
  return function* (...args: never[]): Generator<unknown, unknown, unknown> {
    const value = yield (fn as (...a: never[]) => unknown).apply(assets, args)
    return requireProvider(
      value,
      capability,
      `the asset provider returned nothing for ${capability}`,
      filter.context.capabilities
    )
  }
}

export function* asset_url(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return stringify(yield provider(this, 'asset_url', 'assetUrl')(stringify(v) as never))
}

export function* global_asset_url(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return stringify(yield provider(this, 'global_asset_url', 'shopifyAssetUrl')(stringify(v) as never))
}

export function* shopify_asset_url(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return stringify(yield provider(this, 'shopify_asset_url', 'shopifyAssetUrl')(stringify(v) as never))
}

export function* file_url(this: FilterImpl, v: unknown): Generator<unknown, string, unknown> {
  return stringify(yield provider(this, 'file_url', 'fileUrl')(stringify(v) as never))
}

export function* image_url(this: FilterImpl, v: unknown, ...args: unknown[]): Generator<unknown, string, unknown> {
  const options = optionsOf(args)
  return stringify(yield provider(this, 'image_url', 'imageUrl')(toValue(v) as never, options as never))
}

export function* img_url(
  this: FilterImpl,
  v: unknown,
  size?: unknown,
  ...args: unknown[]
): Generator<unknown, string, unknown> {
  const options = optionsOf(args)
  if (!isNil(size)) options['size'] = stringify(size)
  return stringify(yield provider(this, 'img_url', 'imageUrl')(toValue(v) as never, options as never))
}

export const asset_img_url = img_url
export const file_img_url = img_url
export const article_img_url = img_url
export const collection_img_url = img_url
export const product_img_url = img_url

export function image_tag(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const attrs = optionsOf(args)
  return tag('img', { src: stringify(toValue(v)), ...attrs })
}

export const img_tag = image_tag

export function video_tag(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  return mediaTag.call(this, 'video', v, args)
}

export function model_viewer_tag(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  return mediaTag.call(this, 'model-viewer', v, args)
}

export function media_tag(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const media = toValue(v) as Record<string, unknown> | null
  const kind = stringify(toValue(media?.['media_type']))
  if (kind === 'video') return video_tag.call(this, v, ...args)
  if (kind === 'model') return model_viewer_tag.call(this, v, ...args)
  if (kind === 'external_video') return external_video_tag.call(this, v, ...args)
  return image_tag.call(this, media?.['src'] ?? media, ...args)
}

export function external_video_url(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const media = toValue(v) as Record<string, unknown> | null
  const base = stringify(toValue(media?.['external_id'] ? media['external_id'] : media))
  const host = stringify(toValue(media?.['host'])) || 'youtube'
  const params = [...keywords(args)].map(
    ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(stringify(toValue(value)))}`
  )
  const url = host === 'vimeo' ? `https://player.vimeo.com/video/${base}` : `https://www.youtube.com/embed/${base}`
  return params.length ? `${url}?${params.join('&')}` : url
}

export function external_video_tag(this: FilterImpl, v: unknown, ...args: unknown[]): string {
  const attrs = optionsOf(args)
  return tag('iframe', { src: external_video_url.call(this, v), ...attrs })
}

export function* font_url(this: FilterImpl, v: unknown, format?: unknown): Generator<unknown, string, unknown> {
  return stringify(yield provider(this, 'font_url', 'fontUrl')(toValue(v) as never, stringify(format) as never))
}

export function* font_face(this: FilterImpl, v: unknown, ...args: unknown[]): Generator<unknown, string, unknown> {
  const options = optionsOf(args)
  return stringify(yield provider(this, 'font_face', 'fontFace')(toValue(v) as never, options as never))
}

export function font_modify(this: FilterImpl, v: unknown, property: unknown, value: unknown): unknown {
  return provider(this, 'font_modify', 'fontModify')(
    toValue(v) as never,
    stringify(property) as never,
    toValue(value) as never
  )
}

export function metafield_text(this: FilterImpl, v: unknown): string {
  const field = toValue(v) as Record<string, unknown> | null
  return stringify(toValue(field?.['value'] ?? field))
}

export function metafield_tag(this: FilterImpl, v: unknown): string {
  const field = toValue(v) as Record<string, unknown> | null
  const type = stringify(toValue(field?.['type']))
  const text = metafield_text.call(this, v)
  return `<span class="metafield-${escape.call(this, type || 'single_line_text_field')}">${escape.call(
    this,
    text
  )}</span>`
}

function mediaTag(this: FilterImpl, name: string, v: unknown, args: unknown[]): string {
  const media = toValue(v) as Record<string, unknown> | null
  const attrs = optionsOf(args)
  return tag(name, { src: stringify(toValue(media?.['src'] ?? media)), ...attrs })
}

function tag(name: string, attrs: Record<string, unknown>): string {
  const rendered = Object.entries(attrs)
    .filter(([, value]) => !isNil(value) && value !== false && value !== '')
    .map(([key, value]) => ` ${key}="${escape.call(undefined as never, stringify(value))}"`)
    .join('')
  return name === 'img' ? `<${name}${rendered} />` : `<${name}${rendered}></${name}>`
}
