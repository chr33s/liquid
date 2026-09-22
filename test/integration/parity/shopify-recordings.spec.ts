import { Liquid } from '../../../src/liquid'

/**
 * Hosted behaviour recorded from Shopify production in the pinned
 * liquid-spec corpus (`shopify_production_recordings`, `shopify_theme_dawn`).
 */
describe('parity: Shopify production recordings', function () {
  const hosted = (options = {}) => new Liquid({ profile: 'shopify_theme', ...options })

  it('bugCompatibleWhitespaceTrimming keeps the first character of text a trim empties', async function () {
    const src = 'a{{ 1 }}\n\n{%- if true -%}\n\n  b{%- endif %}|x  {%- assign q = 1 -%}  \n  {%- assign r = 1 %}'
    expect(await hosted({ bugCompatibleWhitespaceTrimming: true }).parseAndRender(src)).toBe('a1\nb|x')
    expect(await hosted().parseAndRender(src)).toBe('a1b|x')
  })

  it('renders a range in full, and caps an array at 50', async function () {
    const engine = hosted()
    expect((await engine.parseAndRender('{% for i in (5..999) %}{{ i }},{% endfor %}')).split(',')).toHaveLength(996)
    const items = Array.from({ length: 60 }, (_, i) => i)
    expect((await engine.parseAndRender('{% for i in a %}{{ i }},{% endfor %}', { a: items })).split(',')).toHaveLength(
      51
    )
  })

  it('stylesheet_tag defaults media to all', async function () {
    expect(await hosted().parseAndRender('{{ "/t.css" | stylesheet_tag }}')).toBe(
      '<link href="/t.css" rel="stylesheet" type="text/css" media="all" />'
    )
  })

  it('renders an app block with {% render block %}', async function () {
    for (const errorMode of ['lax', 'strict', 'strict2'] as const) {
      const engine = hosted({ errorMode, theme: { appBlock: (block: { id: string }) => `<app ${block.id}>` } })
      const src = '{% for block in blocks %}{% render block %}{% endfor %}'
      expect(await engine.parseAndRender(src, { blocks: [{ id: 'a', type: '@app' }] })).toBe('<app a>')
      expect(() => new Liquid({ errorMode }).parse('{% render block %}')).toThrow()
    }
  })

  it('section and block settings fall back to their schema defaults', async function () {
    const schema = {
      settings: [
        { id: 'title', type: 'text', default: 'Hi' },
        { id: 'pad', type: 'range', default: 36 }
      ],
      blocks: [{ type: 't', settings: [{ id: 'text', type: 'text', default: 'D' }] }]
    }
    const engine = hosted({
      templates: {
        'sections/hero': `{{ section.settings.title }}|{{ section.settings.pad }}|{% for b in section.blocks %}{{ b.settings.text }}{% endfor %}{% schema %}${JSON.stringify(schema)}{% endschema %}`
      },
      theme: {
        sectionGroups: {
          main: { sections: { hero: { type: 'hero', settings: { pad: 10 }, blocks: [{ type: 't' }] } } }
        }
      }
    })
    expect(await engine.parseAndRender("{% sections 'main' %}")).toContain('Hi|10|D')
  })

  it('base64 keeps bytes that are not UTF-8', async function () {
    const engine = hosted()
    expect(await engine.parseAndRender("{{ '/wABAA==' | base64_decode | base64_encode }}")).toBe('/wABAA==')
    expect(await engine.parseAndRender("{{ '/wABAA==' | base64_decode | split: nul | size }}", { nul: '\0' })).toBe('2')
    expect(await engine.parseAndRender("{{ 'héllo' | base64_encode | base64_decode }}")).toBe('héllo')
  })
})
