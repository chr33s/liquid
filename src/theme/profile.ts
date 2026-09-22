/**
 * Which dialect a render is expected to match.
 *
 * `core` is the Ruby reference engine. `shopify_theme` additionally applies the
 * documented hosted theme limits and makes the theme tags and filters available.
 */
export type LiquidProfile = 'core' | 'shopify_theme'

/** Documented hosted limits, kept out of the core profile. */
export const hostedLimits = {
  /** Items an ordinary `{% for %}` renders when no `limit:` is given. */
  forLoopDefaultLimit: 50,
  /** Accepted `{% paginate %}` page sizes. */
  paginateMinPageSize: 1,
  paginateMaxPageSize: 250,
  /** Items reachable through pagination. */
  paginateMaxItems: 25000,
  /** Links either side of the current page in `paginate.parts`. */
  paginateWindowSize: 2
} as const

export function isHosted(profile: LiquidProfile): boolean {
  return profile === 'shopify_theme'
}
