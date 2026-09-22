import { FilterImpl } from '../../template'
import { isArray, toValue, LiquidRange } from '../../util'

/**
 * Fields the hosted `json` projection leaves out of a product or variant.
 */
const INVENTORY_FIELDS: ReadonlySet<string> = new Set([
  'inventory_quantity',
  'inventory_management',
  'inventory_policy'
])
const EXCLUDED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['product', INVENTORY_FIELDS],
  ['variant', INVENTORY_FIELDS]
])

/**
 * Serializes a value for a template. Unlike a raw `JSON.stringify`, a nil is
 * written as `null`, drops are read through their liquid value, and documented
 * inventory fields are excluded from product projections.
 */
export function json(this: FilterImpl, value: unknown): string {
  return serialize(project(value, new Set<object>())) ?? 'null'
}

function serialize(value: unknown): string | undefined {
  if (typeof value === 'bigint') return String(value)
  if (isArray(value)) return `[${Array.from(value, item => serialize(item) ?? 'null').join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries: string[] = []
    for (const [key, member] of Object.entries(value)) {
      const serialized = serialize(member)
      if (serialized !== undefined) entries.push(`${JSON.stringify(key)}:${serialized}`)
    }
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function project(value: unknown, path: Set<object>): unknown {
  const resolved = toValue(value)
  if (resolved === undefined || resolved === null) return null
  if (typeof resolved !== 'object') return resolved
  if (resolved instanceof Date) return resolved.toISOString()
  if (resolved instanceof LiquidRange) return resolved.toArray()
  // only an ancestor is a cycle; the same object reached twice by different
  // paths is serialized twice, as the hosted projection does
  if (path.has(resolved as object)) return null
  path.add(resolved as object)
  try {
    if (isArray(resolved)) return resolved.map(item => project(item, path))

    const record = resolved as Record<string, unknown>
    const excluded = EXCLUDED.get(String(record['object_type'] ?? '')) ?? EXCLUDED.get(detectType(record))
    const out: Record<string, unknown> = {}
    for (const [key, member] of Object.entries(record)) {
      if (excluded?.has(key)) continue
      if (typeof member === 'function') continue
      out[key] = project(member, path)
    }
    return out
  } finally {
    path.delete(resolved as object)
  }
}

/** Recognizes the shapes the hosted projection treats as products or variants. */
function detectType(record: Record<string, unknown>): string {
  if ('variants' in record && 'handle' in record) return 'product'
  if ('inventory_quantity' in record && 'price' in record) return 'variant'
  return ''
}
