import type { LiquidProfile } from '../theme'

/**
 * Where a supported name comes from.
 *
 * - `ruby_core` — the pinned Ruby reference engine
 * - `hosted` — the reviewed Shopify theme documentation
 * - `host_adaptation` — a JavaScript-side addition with no reference twin,
 *   retained because the host language or runtime needs it
 */
export type Provenance = 'ruby_core' | 'hosted' | 'host_adaptation'

export type SupportStatus = 'implemented' | 'provider_required' | 'unsupported'

export interface CompatEntry {
  kind: 'filter' | 'tag' | 'option'
  provenance: Provenance
  profiles: LiquidProfile[]
  status: SupportStatus
  /** The provider member a `provider_required` entry depends on. */
  provider?: string
  notes?: string
}

/** The sources this manifest was reconciled against. */
export const sources = {
  rubyCore: {
    repository: 'Shopify/liquid',
    revision: '4e39ae4cc3da73921923c0669e0fc84a66b2f696',
    version: '5.14.0'
  },
  hosted: {
    reference: 'https://shopify.dev/docs/api/liquid',
    reviewedOn: '2026-09-21',
    catalog: 'Shopify/theme-liquid-docs',
    catalogRevision: '5dffe0f7ca76f902f212a602478bc8f5ce0c893a',
    runtimeRevision: null as string | null
  }
} as const
