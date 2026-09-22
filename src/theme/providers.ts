import type { Sequence } from '../util/sequence'

/** The request a theme render is answering. */
export interface ThemeRequest {
  path?: string
  page_type?: string
  host?: string
  locale?: string
  query?: Record<string, string | string[]>
  /** Set by the platform after a `{% form %}` post. */
  posted_successfully?: boolean
  form_errors?: Record<string, string[]>
}

/**
 * A collection the platform can page through without materializing it. When a
 * provider supplies `slice`, only the requested window is fetched.
 */
export interface PaginatedSource<T = unknown> {
  size: number
  slice(from: number, to: number): T[] | Promise<T[]>
}

export interface AssetProvider {
  /** CDN url for a theme asset, given its file name, e.g. `theme.css`. */
  assetUrl?(path: string): string | undefined | Promise<string | undefined>
  /** CDN url for a file uploaded to the shop. */
  fileUrl?(path: string): string | undefined | Promise<string | undefined>
  /** Url for a Shopify-hosted shared asset. */
  shopifyAssetUrl?(path: string): string | undefined | Promise<string | undefined>
  /** Contents of a theme asset, for `inline_asset_content`. */
  inlineAsset?(path: string): string | undefined | Promise<string | undefined>
  imageUrl?(image: unknown, options: Record<string, unknown>): string | undefined | Promise<string | undefined>
  fontUrl?(font: unknown, format?: string): string | undefined | Promise<string | undefined>
  fontFace?(font: unknown, options: Record<string, unknown>): string | undefined | Promise<string | undefined>
  fontModify?(font: unknown, property: string, value: unknown): unknown
}

export interface LocaleBundle {
  /** Translation keys, nested or flattened with dots. */
  translations?: Record<string, unknown>
  /** Named `date: format:` patterns. */
  dateFormats?: Record<string, string>
  /** Currency and number formatting. */
  moneyFormat?: string
  moneyWithCurrencyFormat?: string
  currency?: string
}

export interface StoreProvider {
  /** Objects reachable from every template, e.g. `shop`, `cart`, `customer`. */
  globals?: Record<string, unknown>
  /** Resolve a collection for `{% paginate %}` without loading all of it. */
  paginate?(source: unknown): PaginatedSource | undefined | Promise<PaginatedSource | undefined>
  /** Url a form of the given type posts to. */
  formAction?(type: string, subject?: unknown): string | undefined | Promise<string | undefined>
  /** Hidden inputs a form of the given type must carry. */
  formInputs?(
    type: string,
    subject?: unknown
  ): Record<string, string> | undefined | Promise<Record<string, string> | undefined>
  /** Markup the platform owns, e.g. `payment_button`. */
  platformMarkup?(name: string, args: unknown[]): string | undefined | Promise<string | undefined>
}

export interface SectionDefinition {
  /** The section file's name, without directory or extension. */
  type: string
  id?: string
  settings?: Record<string, unknown>
  blocks?: ThemeBlock[]
  disabled?: boolean
}

export interface ThemeBlock {
  type: string
  id?: string
  settings?: Record<string, unknown>
  blocks?: ThemeBlock[]
}

export interface SectionGroup {
  type?: string
  order?: string[]
  sections?: Record<string, SectionDefinition>
}

/**
 * Everything a theme render needs from outside the template language. Each
 * member is optional; a capability with no provider is reported as unsupported
 * instead of rendering as an empty string.
 */
export interface ThemeProviders {
  request?: ThemeRequest
  settings?: Record<string, unknown>
  locale?: string
  locales?: Record<string, LocaleBundle>
  assets?: AssetProvider
  store?: StoreProvider
  sectionGroups?: Record<string, SectionGroup>
  /** Blocks rendered by `{% content_for "blocks" %}`, in order. */
  blocks?: ThemeBlock[]
  /** The markup of an app block, rendered by `{% render block %}`. */
  appBlock?(block: unknown): string | Promise<string>
  /** Identity of the tenant a cached render belongs to. */
  tenant?: string
}

export function sourceLength(source: PaginatedSource | Sequence): number {
  return 'size' in source ? source.size : source.length
}
