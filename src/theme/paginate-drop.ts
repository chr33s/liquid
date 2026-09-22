import { Drop, hideMembers } from '../drop/drop'
import { hostedLimits } from './profile'

const HIDDEN = hideMembers('windowSize')

/** The title the reference uses for an elided run of pages. */
export const GAP_TITLE = '&hellip;'

export interface PaginatePart {
  title: string
  is_link: boolean
  url: string
}

/**
 * The `paginate` object a `{% paginate %}` block exposes.
 */
export class PaginateDrop extends Drop {
  public readonly page_size: number
  public readonly current_page: number
  public readonly current_offset: number
  public readonly items: number
  public readonly pages: number
  public readonly page_param: string
  public readonly parts: PaginatePart[]
  public readonly previous: PaginatePart | null
  public readonly next: PaginatePart | null

  public constructor(
    items: number,
    pageSize: number,
    currentPage: number,
    basePath: string,
    query: Record<string, string | string[]>,
    pageParam = 'page',
    windowSize: number = hostedLimits.paginateWindowSize
  ) {
    super()
    this.page_size = pageSize
    this.items = items
    this.pages = Math.max(1, Math.ceil(items / pageSize))
    this.current_page = Math.min(Math.max(1, currentPage), this.pages)
    this.current_offset = (this.current_page - 1) * pageSize
    this.page_param = pageParam
    const url = (page: number) => buildUrl(basePath, query, pageParam, page)
    this.parts = buildParts(this.pages, this.current_page, windowSize, url)
    this.previous =
      this.current_page > 1 ? { title: '&laquo; Previous', is_link: true, url: url(this.current_page - 1) } : null
    this.next =
      this.current_page < this.pages ? { title: 'Next &raquo;', is_link: true, url: url(this.current_page + 1) } : null
  }

  public hiddenMembers() {
    return HIDDEN
  }
}

function buildParts(pages: number, current: number, windowSize: number, url: (page: number) => string): PaginatePart[] {
  const shown = new Set<number>([1, pages])
  for (let page = current - windowSize; page <= current + windowSize; page++) {
    if (page >= 1 && page <= pages) shown.add(page)
  }
  const ordered = [...shown].sort((a, b) => a - b)
  const parts: PaginatePart[] = []
  let previous = 0
  for (const page of ordered) {
    if (previous && page - previous > 1) parts.push({ title: GAP_TITLE, is_link: false, url: '' })
    parts.push({ title: String(page), is_link: page !== current, url: page === current ? '' : url(page) })
    previous = page
  }
  return parts
}

function buildUrl(basePath: string, query: Record<string, string | string[]>, pageParam: string, page: number): string {
  const params: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (key === pageParam) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`)
    }
  }
  params.push(`${encodeURIComponent(pageParam)}=${page}`)
  return `${basePath}?${params.join('&')}`
}
