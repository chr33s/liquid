import { filters as coreFilters } from '../filters'
import { hostedFilters } from '../filters/hosted'
import { filterSignatures } from '../filters/signatures'
import { tags, hostedTags } from '../tags'
import { isFunction } from '../util'
import type { CompatEntry, Provenance, SupportStatus } from './provenance'
import { sources } from './provenance'
import { rubyCore } from './ruby-core'

/** Names the reference engine documents but that only a provider can answer. */
const PROVIDER_BACKED: Record<string, string> = {
  asset_url: 'assets.assetUrl',
  asset_img_url: 'assets.imageUrl',
  article_img_url: 'assets.imageUrl',
  avatar: 'store.platformMarkup',
  collection_img_url: 'assets.imageUrl',
  currency_selector: 'store.platformMarkup',
  file_img_url: 'assets.imageUrl',
  file_url: 'assets.fileUrl',
  font_face: 'assets.fontFace',
  font_modify: 'assets.fontModify',
  font_url: 'assets.fontUrl',
  global_asset_url: 'assets.shopifyAssetUrl',
  image_url: 'assets.imageUrl',
  img_url: 'assets.imageUrl',
  inline_asset_content: 'assets.inlineAsset',
  login_button: 'store.platformMarkup',
  payment_button: 'store.platformMarkup',
  payment_terms: 'store.platformMarkup',
  payment_type_img_url: 'store.platformMarkup',
  payment_type_svg_tag: 'store.platformMarkup',
  product_img_url: 'assets.imageUrl',
  shopify_asset_url: 'assets.shopifyAssetUrl'
}

const RUBY_CORE_FILTERS: ReadonlySet<string> = new Set(rubyCore.filters)
const RUBY_CORE_TAGS: ReadonlySet<string> = new Set(rubyCore.tags)

/** Where a name comes from, judged by the pinned reference inventory rather than by which registry holds it. */
function provenanceOf(name: string, reference: ReadonlySet<string>, hostedOnly: boolean): Provenance {
  if (reference.has(name)) return 'ruby_core'
  return hostedOnly ? 'hosted' : 'host_adaptation'
}

function filterEntry(name: string, hostedOnly: boolean): CompatEntry {
  const provider = PROVIDER_BACKED[name]
  const provenance = provenanceOf(name, RUBY_CORE_FILTERS, hostedOnly)
  const status: SupportStatus = provider ? 'provider_required' : 'implemented'
  return {
    kind: 'filter',
    provenance,
    profiles: hostedOnly ? ['shopify_theme'] : ['core', 'shopify_theme'],
    status,
    ...(provider ? { provider } : {})
  }
}

export interface CompatibilityManifest {
  sources: typeof sources
  filters: Record<string, CompatEntry & { arity?: [number, number] }>
  tags: Record<string, CompatEntry>
  counts: {
    coreFilters: number
    hostedOnlyFilters: number
    tags: number
    providerRequired: number
  }
}

/**
 * The names this build supports, with where each one comes from and whether it
 * needs a provider. Built from the live registries so it cannot drift; the
 * provenance comes from the pinned reference inventory in `rubyCore`.
 */
export function buildCompatibilityManifest(): CompatibilityManifest {
  const filters: CompatibilityManifest['filters'] = {}
  for (const name of Object.keys(coreFilters).sort()) {
    const arity = filterSignatures[name]
    filters[name] = { ...filterEntry(name, false), ...(arity ? { arity } : {}) }
  }
  for (const name of Object.keys(hostedFilters).sort()) {
    if (name in filters) continue
    const arity = filterSignatures[name]
    filters[name] = { ...filterEntry(name, true), ...(arity ? { arity } : {}) }
  }

  const tagEntries: Record<string, CompatEntry> = {}
  for (const name of [...Object.keys(tags), ...Object.keys(hostedTags)].sort()) {
    const hosted = !(name in tags)
    tagEntries[name] = {
      kind: 'tag',
      provenance: provenanceOf(name, RUBY_CORE_TAGS, hosted),
      profiles: hosted ? ['shopify_theme'] : ['core', 'shopify_theme'],
      status: 'implemented'
    }
  }

  const providerRequired = Object.values(filters).filter(entry => entry.status === 'provider_required').length
  return {
    sources,
    filters,
    tags: tagEntries,
    counts: {
      coreFilters: Object.keys(coreFilters).length,
      hostedOnlyFilters: Object.keys(filters).length - Object.keys(coreFilters).length,
      tags: Object.keys(tagEntries).length,
      providerRequired
    }
  }
}

/** Filters that are registered but have no callable implementation. */
export function unimplementedFilters(): string[] {
  return Object.entries({ ...coreFilters, ...hostedFilters })
    .filter(([, impl]) => !isFunction(impl) && !isFunction(impl?.handler))
    .map(([name]) => name)
}
