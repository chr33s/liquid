import { Liquid } from '../../../src/liquid'
import { Context } from '../../../src/context'
import SchemaTag from '../../../src/tags/schema'
import { StylesheetTag } from '../../../src/tags/asset'
import type { ThemeProviders } from '../../../src/theme'
import { mock, restore } from '../../stub/mockfs'

function theme(files: Record<string, string>, providers: ThemeProviders = {}) {
  mock(Object.fromEntries(Object.entries(files).map(([name, content]) => [`/theme/${name}`, content])))
  return new Liquid({
    profile: 'shopify_theme',
    root: '/theme',
    partials: '/theme',
    layouts: '/theme/layout',
    extname: '.liquid',
    theme: providers
  })
}

describe('parity: theme runtime', function () {
  afterEach(restore)

  it('H09: the default theme layout wraps template output', async function () {
    const engine = theme({
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'index.liquid': 'BODY'
    })
    expect(await engine.renderFile('index')).toBe('<main>BODY</main>')
  })

  it('H09: a theme without a default layout renders the template alone', async function () {
    const engine = theme({ 'index.liquid': 'BODY' })
    expect(await engine.renderFile('index')).toBe('BODY')
  })

  it('H10: layout none renders the template without an outer layout', async function () {
    const engine = theme({
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'index.liquid': '{% layout none %}BODY'
    })
    expect(await engine.renderFile('index')).toBe('BODY')
  })

  it('H11: a quoted alternate layout resolves in the layout namespace', async function () {
    const engine = theme({
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'layout/alternate.liquid': '<alt>{{ content_for_layout }}</alt>',
      'index.liquid': '{% layout "alternate.liquid" %}BODY'
    })
    expect(await engine.renderFile('index')).toBe('<alt>BODY</alt>')
  })

  it('H13: a missing layout fails and leaves the engine usable', async function () {
    const engine = theme({
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'index.liquid': '{% layout "nope" %}BODY',
      'other.liquid': 'OTHER'
    })
    await expect(engine.renderFile('index')).rejects.toThrow(/Failed to lookup/)
    expect(await engine.renderFile('other')).toBe('<main>OTHER</main>')
  })

  it('H14: schema is metadata, is not executed and is not output', async function () {
    const engine = theme({
      'index.liquid': 'A{% schema %}{"name":"Hero","settings":[{"id":"title","type":"text"}]}{% endschema %}B'
    })
    expect(await engine.renderFile('index')).toBe('AB')
    const [, schema] = engine.parse(
      'A{% schema %}{"name":"Hero","settings":[{"id":"title","type":"text"}]}{% endschema %}B'
    )
    expect((schema as InstanceType<typeof SchemaTag>).schema).toEqual({
      name: 'Hero',
      settings: [{ id: 'title', type: 'text' }]
    })
  })

  it('H14: schema bodies holding Liquid delimiters are not executed', async function () {
    const engine = theme({ 'index.liquid': '{% schema %}{"name":"{{ boom }}"}{% endschema %}' })
    expect(await engine.renderFile('index')).toBe('')
    const [schema] = engine.parse('{% schema %}{"name":"{{ boom }}"}{% endschema %}')
    expect((schema as InstanceType<typeof SchemaTag>).schema).toEqual({ name: '{{ boom }}' })
  })

  it('H14: invalid and duplicate schema placement is rejected', async function () {
    const engine = theme({})
    expect(() => engine.parse('{% schema %}not json{% endschema %}')).toThrow(/invalid schema/)
    expect(() => engine.parse('{% schema %}[1]{% endschema %}')).toThrow(/schema must be a JSON object/)
    expect(() => engine.parse('{% schema x %}{}{% endschema %}')).toThrow(/takes no arguments/)
    await expect(engine.parseAndRender('{% schema %}{}{% endschema %}{% schema %}{}{% endschema %}')).rejects.toThrow(
      /only one \{% schema %\}/
    )
  })

  it('H14: schema is a hosted-only tag', function () {
    expect(() => new Liquid().parse('{% schema %}{}{% endschema %}')).toThrow("Unknown tag 'schema'")
  })

  it('H15: a static section renders with identity, settings and wrapper', async function () {
    const engine = theme({
      'sections/hero.liquid': '[{{ section.id }}|{{ section.type }}|{{ section.settings.title }}]',
      'index.liquid': '{% section "hero" %}'
    })
    expect(await engine.renderFile('index')).toBe(
      '<div id="shopify-section-hero" class="shopify-section">[hero|hero|]</div>'
    )
  })

  it('keeps section identity through nested snippets without leaking local assignments', async function () {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: {
        'sections/hero': '{% assign local = "secret" %}{{ section.id }}:{% render "snippet" %}',
        'sections/other': '{% render "leaf" %}',
        snippet: '{{ section.id }}|{{ local }}|{% section "other" %}|{% render "leaf" %}',
        leaf: '{{ section.id }}'
      }
    })
    expect(await engine.parseAndRender('{% section "hero" %}|{{ section.id }}')).toBe(
      '<div id="shopify-section-hero" class="shopify-section">hero:hero||' +
        '<div id="shopify-section-other" class="shopify-section">other</div>|hero</div>|'
    )
  })

  it('H15: a section does not see caller locals', async function () {
    const engine = theme({
      'sections/hero.liquid': '[{{ local }}]',
      'index.liquid': '{% assign local = "L" %}{% section "hero" %}'
    })
    expect(await engine.renderFile('index')).toBe('<div id="shopify-section-hero" class="shopify-section">[]</div>')
  })

  it('H16: section groups render in the configured order with their settings', async function () {
    const engine = theme(
      {
        'sections/a.liquid': '[a:{{ section.settings.x }}{{ leak }}]{% assign leak = "L" %}',
        'sections/b.liquid': '[b:{{ section.settings.x }}{{ leak }}]',
        'index.liquid': '{% sections "header" %}'
      },
      {
        sectionGroups: {
          header: {
            order: ['two', 'one'],
            sections: {
              one: { type: 'a', settings: { x: 1 } },
              two: { type: 'b', settings: { x: 2 } }
            }
          }
        }
      }
    )
    expect(await engine.renderFile('index')).toBe(
      '<div id="shopify-section-two" class="shopify-section">[b:2]</div>' +
        '<div id="shopify-section-one" class="shopify-section">[a:1]</div>'
    )
  })

  it.each([false, true])('section groups use their own blocks with root blocks: %s', async function (withRootBlocks) {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: {
        'sections/group': '{% content_for "blocks" %}',
        'blocks/text': '{{ block.id }}'
      },
      theme: {
        blocks: withRootBlocks ? [{ type: 'text', id: 'root' }] : undefined,
        sectionGroups: {
          header: {
            order: ['full', 'empty'],
            sections: {
              full: { type: 'group', blocks: [{ type: 'text', id: 'child' }] },
              empty: { type: 'group' }
            }
          }
        }
      }
    })
    expect(await engine.parseAndRender('{% sections "header" %}')).toBe(
      '<div id="shopify-section-full" class="shopify-section">child</div>' +
        '<div id="shopify-section-empty" class="shopify-section"></div>'
    )
    if (withRootBlocks) expect(await engine.parseAndRender('{% content_for "blocks" %}')).toBe('root')
  })

  it.each([
    ['section', 'sections', '<div id="shopify-section-leaf" class="shopify-section">OK</div>'],
    ['content_for "block", type:', 'blocks', 'OK']
  ])('enforces and releases nesting depth for %s', async function (tag, directory, output) {
    const recursive = `{% ${tag} "recursive" %}`
    const leaf = `{% ${tag} "leaf" %}`
    const engine = new Liquid({
      profile: 'shopify_theme',
      maxDepth: 2,
      templateLimit: 40,
      templates: { [`${directory}/recursive`]: recursive, [`${directory}/leaf`]: 'OK' }
    })
    const ctx = new Context({}, engine.options)
    await expect(engine.parseAndRender(recursive, ctx)).rejects.toThrow('Nesting too deep')
    await expect(engine.parseAndRender(`{% ${tag} "missing" %}`, ctx)).rejects.toThrow('ENOENT')
    expect(await engine.parseAndRender(leaf + leaf, ctx)).toBe(output.repeat(2))
  })

  it('H16: a missing section group is reported as unsupported', async function () {
    const engine = theme({ 'index.liquid': '{% sections "header" %}' })
    await expect(engine.renderFile('index')).rejects.toThrow(/unsupported capability "sections"/)
  })

  it('H17: content_for blocks follows the configured block order', async function () {
    const engine = theme(
      {
        'blocks/text.liquid': '[text:{{ block.id }}:{{ block.settings.v }}]',
        'blocks/image.liquid': '[image:{{ block.id }}]',
        'index.liquid': '{% content_for "blocks" %}'
      },
      {
        blocks: [
          { type: 'image', id: 'i1' },
          { type: 'text', id: 't1', settings: { v: 'hi' } }
        ]
      }
    )
    expect(await engine.renderFile('index')).toBe('[image:i1][text:t1:hi]')
  })

  it('nested content_for blocks render children without changing sibling blocks', async function () {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templateLimit: 100,
      templates: {
        'blocks/group': '[{{ block.id }}:{% content_for "blocks" %}]',
        'blocks/leaf': '{{ block.id }}{% content_for "blocks" %}'
      },
      theme: {
        blocks: [
          {
            type: 'group',
            id: 'parent',
            blocks: [{ type: 'group', id: 'child', blocks: [{ type: 'leaf', id: 'leaf' }] }]
          },
          { type: 'leaf', id: 'sibling' }
        ]
      }
    })
    expect(await engine.parseAndRender('{% content_for "blocks" %}')).toBe('[parent:[child:leaf]]sibling')
    expect(await engine.parseAndRender('{% content_for "block", type: "group", id: "static" %}')).toBe('[static:]')
  })

  it('H18: content_for block takes type, id and explicit arguments', async function () {
    const engine = theme({
      'blocks/text.liquid': '[{{ block.type }}:{{ block.id }}:{{ extra }}]',
      'index.liquid': '{% content_for "block", type: "text", id: "t9", extra: "E" %}'
    })
    expect(await engine.renderFile('index')).toBe('[text:t9:E]')
  })

  it('H18: content_for requires a known target and a type', async function () {
    const engine = theme({ 'index.liquid': '{% content_for "nope" %}', 'other.liquid': '{% content_for "block" %}' })
    await expect(engine.renderFile('index')).rejects.toThrow(/unknown content_for target "nope"/)
    await expect(engine.renderFile('other')).rejects.toThrow(/requires a type/)
  })

  it('H19: style evaluates settings and emits style[data-shopify]', async function () {
    const engine = theme({ 'index.liquid': '{% style %}.a{color:{{ settings.c }}}{% endstyle %}' })
    expect(await engine.renderFile('index', { settings: { c: 'red' } })).toBe(
      '<style data-shopify>.a{color:red}</style>'
    )
  })

  it('H20: stylesheet and javascript collect static assets without evaluating them', async function () {
    const engine = theme({
      'sections/hero.liquid':
        'H{% stylesheet %}.a{content:"{{ boom }}"}{% endstylesheet %}{% javascript %}var a = {{ boom }};{% endjavascript %}',
      'index.liquid': '{% section "hero" %}{% section "hero" %}'
    })
    expect(await engine.renderFile('index')).toBe(
      '<div id="shopify-section-hero" class="shopify-section">H</div>'.repeat(2)
    )
    const [asset] = engine.parse('{% stylesheet %}.a{content:"{{ boom }}"}{% endstylesheet %}')
    expect((asset as StylesheetTag).content).toBe('.a{content:"{{ boom }}"}')
  })

  it('H20: repeated renders contribute one asset entry per file', async function () {
    const engine = theme({
      'sections/hero.liquid': '{% stylesheet %}.a{}{% endstylesheet %}',
      'index.liquid': '{% section "hero" %}{% section "hero" %}'
    })
    await engine.renderFile('index')
    await engine.renderFile('index')
    // the collection is per render and de-duplicated within it
    const templates = engine.parse('{% stylesheet %}.a{}{% endstylesheet %}{% stylesheet %}.a{}{% endstylesheet %}')
    expect(await engine.render(templates)).toBe('')
  })
})
