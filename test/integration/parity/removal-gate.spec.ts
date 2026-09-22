import { Liquid } from '../../../src/liquid'
import { filters as coreFilters } from '../../../src/filters'
import { hostedFilters } from '../../../src/filters/hosted'
import { tags as coreTags } from '../../../src/tags'
import { rubyCore } from '../../../src/compat'
import inventory from '../../../liquid-filter-inventory.json'

const REMOVED_FILTERS: string[] = inventory.remove
const RETAINED_HOSTED: string[] = inventory.retain_hosted

describe('parity: revised removal gate', function () {
  const core = new Liquid()
  const hosted = new Liquid({ profile: 'shopify_theme' })

  it('E04: the flagged names are absent from every registry', function () {
    for (const name of REMOVED_FILTERS) {
      expect(coreFilters[name]).toBeUndefined()
      expect(hostedFilters[name]).toBeUndefined()
      expect(core.filters[name]).toBeUndefined()
      expect(hosted.filters[name]).toBeUndefined()
    }
  })

  it('E04: the reclassified filters are retained by the hosted profile only', function () {
    for (const name of RETAINED_HOSTED) {
      expect(coreFilters[name]).toBeUndefined()
      expect(core.filters[name]).toBeUndefined()
      expect(hosted.filters[name]).toBeDefined()
    }
  })

  it('R8: the core registries hold exactly the pinned reference inventory', function () {
    expect(Object.keys(coreFilters).sort()).toEqual([...rubyCore.filters].sort())
    expect(Object.keys(coreTags).sort()).toEqual([...rubyCore.tags].sort())
    expect(Object.keys(core.filters).sort()).toEqual([...rubyCore.filters].sort())
    expect(Object.keys(core.tags).sort()).toEqual([...rubyCore.tags].sort())
  })

  it('R8: layout, json, sha256 and hmac_sha256 are not core built-ins', async function () {
    await expect(core.parseAndRender('{% layout "main" %}A')).rejects.toThrow("Unknown tag 'layout'")
    const strict = new Liquid({ strictFilters: true })
    for (const name of ['json', 'sha256', 'hmac_sha256']) {
      expect(await core.parseAndRender(`{{ "x" | ${name} }}`)).toBe('x')
      await expect(strict.parseAndRender(`{{ "x" | ${name} }}`)).rejects.toThrow(`undefined filter: ${name}`)
    }
  })

  it('R8: raw and squish stay in core', async function () {
    expect(await core.parseAndRender('{% raw %}{{ a }}{% endraw %}|{{ " a  b " | squish }}')).toBe('{{ a }}|a b')
  })

  it('E04: an unknown filter is ignored under the permissive policy and raised under the strict one', async function () {
    expect(await core.parseAndRender('{{ "x" | slugify }}')).toBe('x')
    const strict = new Liquid({ strictFilters: true })
    await expect(strict.parseAndRender('{{ "x" | slugify }}')).rejects.toThrow('undefined filter: slugify')
  })

  it('H12: the inheritance block tag is gone while hosted layout resolution stays', async function () {
    expect(coreTags['block']).toBeUndefined()
    await expect(core.parseAndRender('{% block a %}x{% endblock %}')).rejects.toThrow("Unknown tag 'block'")
    const engine = new Liquid({ profile: 'shopify_theme', templates: { main: 'X{{ content_for_layout }}Y' } })
    expect(await engine.parseAndRender('{% layout "main" %}A')).toBe('XAY')
  })

  it('H12: a block object is still an ordinary value', async function () {
    expect(await core.parseAndRender('{{ block.type }}', { block: { type: 'text' } })).toBe('text')
  })

  it('E04: removed options are no longer accepted by the type surface', function () {
    const options = new Liquid().options as unknown as Record<string, unknown>
    for (const name of ['jekyllInclude', 'jekyllWhere', 'jsTruthy', 'dynamicPartials']) {
      expect(options[name]).toBeUndefined()
    }
  })

  it('E04: whitespace markers, registration hooks and adapters are preserved', async function () {
    expect(await core.parseAndRender('{{- "a" -}}')).toBe('a')
    const engine = new Liquid()
    engine.registerFilter('twice', (v: string) => v + v)
    expect(await engine.parseAndRender('{{ "a" | twice }}')).toBe('aa')
    expect(await engine.parseAndRender('{{ "a" | twice }}')).toBe('aa')
  })

  it('H40: the reviewed source pins are recorded alongside the decision', function () {
    expect(inventory.baselines.ruby_core.version).toBe('5.14.0')
    expect(inventory.baselines.shopify_hosted.runtime_revision).toBeNull()
    expect(REMOVED_FILTERS).toHaveLength(27)
    expect(RETAINED_HOSTED).toEqual(['hmac_sha256', 'json', 'sha256'])
  })
})
