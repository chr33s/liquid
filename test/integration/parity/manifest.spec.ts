import { buildCompatibilityManifest, rubyCore, unimplementedFilters } from '../../../src/compat'
import { Liquid } from '../../../src/liquid'
import inventory from '../../../liquid-filter-inventory.json'

describe('parity: compatibility manifest', function () {
  const manifest = buildCompatibilityManifest()

  it('reconciles with the audited inventory counts', function () {
    expect(manifest.counts.coreFilters).toBe(rubyCore.filters.length)
    expect(manifest.counts.hostedOnlyFilters).toBe(
      inventory.counts.reviewed_hosted_only_names_missing_downstream + inventory.retain_hosted.length
    )
  })

  it('labels a name ruby_core exactly when the pinned reference inventory has it', function () {
    for (const [name, entry] of Object.entries({ ...manifest.filters, ...manifest.tags })) {
      const reference: readonly string[] = entry.kind === 'filter' ? rubyCore.filters : rubyCore.tags
      expect(entry.provenance === 'ruby_core', name).toBe(reference.includes(name))
    }
    expect(manifest.filters['squish'].provenance).toBe('ruby_core')
    expect(Object.values(manifest.filters).some(entry => entry.provenance === 'host_adaptation')).toBe(false)
  })

  it('covers every name the reviewed hosted catalog listed as missing', function () {
    for (const name of inventory.hosted_only_missing_reviewed as string[]) {
      expect(manifest.filters[name]).toBeDefined()
      expect(manifest.filters[name].profiles).toContain('shopify_theme')
    }
  })

  it('carries the missing core filters that the audit recorded', function () {
    for (const name of inventory.missing as string[]) {
      expect(manifest.filters[name]).toBeDefined()
      expect(manifest.filters[name].profiles).toContain('core')
    }
  })

  it('holds no entry for a removed name', function () {
    for (const name of inventory.remove as string[]) {
      expect(manifest.filters[name]).toBeUndefined()
    }
  })

  it('records the source pins without claiming a hosted runtime revision', function () {
    expect(manifest.sources.rubyCore.version).toBe('5.14.0')
    expect(manifest.sources.rubyCore.revision).toBe(inventory.baselines.ruby_core.revision)
    expect(manifest.sources.hosted.catalogRevision).toBe(
      inventory.baselines.shopify_hosted.supplemental_catalog_revision
    )
    expect(manifest.sources.hosted.runtimeRevision).toBeNull()
  })

  it('marks provider-backed names rather than reporting them as complete', function () {
    expect(manifest.counts.providerRequired).toBeGreaterThan(0)
    for (const [name, entry] of Object.entries(manifest.filters)) {
      if (entry.status !== 'provider_required') continue
      expect(entry.provider).toMatch(/^(assets|store)\./)
      expect(entry.profiles).toEqual(['shopify_theme'])
      void name
    }
  })

  it('leaves no registered filter without an implementation', function () {
    expect(unimplementedFilters()).toEqual([])
  })

  it('matches the live registries in both profiles', function () {
    const core = new Liquid()
    const hosted = new Liquid({ profile: 'shopify_theme' })
    for (const [name, entry] of Object.entries(manifest.filters)) {
      expect(hosted.filters[name]).toBeDefined()
      if (entry.profiles.includes('core')) expect(core.filters[name]).toBeDefined()
      else expect(core.filters[name]).toBeUndefined()
    }
    for (const name of Object.keys(manifest.tags)) {
      expect(hosted.tags[name]).toBeDefined()
    }
  })

  it('declares a hosted-only tag for every tag the theme profile adds', function () {
    const core = new Liquid()
    const sources: Record<string, string> = {
      content_for: '{% content_for "blocks" %}',
      layout: '{% layout "x" %}',
      form: '{% form "cart" %}{% endform %}',
      javascript: '{% javascript %}{% endjavascript %}',
      paginate: '{% paginate a by 2 %}{% endpaginate %}',
      schema: '{% schema %}{}{% endschema %}',
      section: '{% section "x" %}',
      sections: '{% sections "x" %}',
      style: '{% style %}{% endstyle %}',
      stylesheet: '{% stylesheet %}{% endstylesheet %}'
    }
    const hostedTags = Object.entries(manifest.tags)
      .filter(([, entry]) => !entry.profiles.includes('core'))
      .map(([name]) => name)
    expect(hostedTags.sort()).toEqual(Object.keys(sources).sort())
    for (const name of hostedTags) {
      expect(() => core.parse(sources[name])).toThrow(`Unknown tag '${name}'`)
    }
  })

  it('records the arity of the core filters it checks', function () {
    expect(manifest.filters['append'].arity).toEqual([1, 1])
    expect(manifest.filters['where'].arity).toEqual([1, 2])
    expect(manifest.filters['divided_by'].arity).toEqual([1, 1])
  })
})
