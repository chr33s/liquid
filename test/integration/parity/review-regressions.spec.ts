import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop'
import { defaultOperators } from '../../../src/render/operator'
import type { ThemeProviders } from '../../../src/theme'
import { mock, restore } from '../../stub/mockfs'

const hosted = (theme: ThemeProviders = {}) => new Liquid({ profile: 'shopify_theme', theme })

describe('regressions found in review', function () {
  const liquid = new Liquid({ root: '/tmp' })
  afterEach(restore)

  it('include bindings live in the scope the tag pushes', async function () {
    const engine = new Liquid({ templates: { p: '[{{ p }}]' } })
    expect(await engine.parseAndRender("{% include 'p' with 1 %}|{{ p }}")).toBe('[1]|')
    expect(await engine.parseAndRender("{% include 'p' for a %}|{{ p }}", { a: [1, 2] })).toBe('[1][2]|')
    // and it does not shadow a global of the same name afterwards
    expect(await engine.parseAndRender("{% include 'p' with 1 %}|{{ p }}", { p: 'global' })).toBe('[1]|global')
  })

  it('equality short circuits on identity and survives cycles', async function () {
    const cyclic: Record<string, unknown> = { n: 1 }
    cyclic['self'] = cyclic
    const twin: Record<string, unknown> = { n: 1 }
    twin['self'] = twin
    expect(await liquid.parseAndRender('{% if a == a %}y{% else %}n{% endif %}', { a: cyclic })).toBe('y')
    expect(await liquid.parseAndRender('{% if a == b %}y{% else %}n{% endif %}', { a: cyclic, b: twin })).toBe('y')
    expect(await liquid.parseAndRender('{% if a == c %}y{% else %}n{% endif %}', { a: cyclic, c: { n: 2 } })).toBe('n')
    const a: unknown[] = []
    const b: unknown[] = []
    a.push(a, 1)
    b.push(b, 1)
    expect(await liquid.parseAndRender('{% if a == b %}y{% else %}n{% endif %}', { a, b })).toBe('y')
    b[1] = 2
    expect(await liquid.parseAndRender('{% if a == b %}y{% else %}n{% endif %}', { a, b })).toBe('n')
  })

  it('a default theme layout that does not parse is reported, not swallowed', async function () {
    const themed = (layout: string) => {
      mock({ '/theme/layout/theme.liquid': layout, '/theme/index.liquid': 'body' })
      return new Liquid({
        profile: 'shopify_theme',
        root: '/theme',
        partials: '/theme',
        layouts: '/theme/layout',
        extname: '.liquid'
      })
    }
    await expect(themed('{% if %}').renderFile('index')).rejects.toThrow()
    expect(await themed('<m>{{ content_for_layout }}</m>').renderFile('index')).toBe('<m>body</m>')
  })

  it('optional platform variables are read without tripping strictVariables', async function () {
    const strict = new Liquid({ profile: 'shopify_theme', strictVariables: true })
    expect(await strict.parseAndRender('{{ "x" | link_to_add_tag: "sale" }}')).toBe(
      '<a href="/collections/all/sale" title="Show tag sale">x</a>'
    )
    expect(await strict.parseAndRender('{{ "x" | link_to_remove_tag: "sale" }}')).toContain('href="/collections/all/"')
    expect(await strict.parseAndRender('{{ "sale" | highlight_active_tag }}')).toBe('sale')
  })

  it('hosted filters that reuse another filter honour a render-local override', async function () {
    const engine = new Liquid({ profile: 'shopify_theme', timezoneOffset: 0 })
    const templates = engine.parse('{{ "2022-12-08" | time_tag: "%Y" }}')
    expect(await engine.render(templates)).toBe('<time datetime="2022-12-08T00:00:00Z">2022</time>')
    expect(await engine.render(templates, {}, { filters: { date: () => 'X' } })).toBe('<time datetime="X">X</time>')
    expect(await engine.render(templates, {}, { filters: { date: async () => 'Y' } })).toBe(
      '<time datetime="Y">Y</time>'
    )
    expect(
      await engine.parseAndRender(
        '{{ value | structured_data }}',
        {},
        {
          filters: {
            json: function* (): Generator<unknown, string, string> {
              return yield Promise.resolve('{"async":true}')
            }
          }
        }
      )
    ).toBe('<script type="application/ld+json">{"async":true}</script>')
  })

  it('self exposes nothing of the context it reads from', async function () {
    for (const path of [
      'origin',
      'origin.opts.root',
      'opts',
      'opts.fs',
      'globals',
      'environments',
      'registers',
      'scopes'
    ]) {
      expect(await liquid.parseAndRender(`[{{ self.${path} }}]`)).toBe('[]')
    }
    expect(await liquid.parseAndRender('{{ self["a"] }}', { a: 1 })).toBe('1')
  })

  it('assign does not materialize a lazy range or stringify to measure it', async function () {
    const start = Date.now()
    expect(await liquid.parseAndRender('{% assign r = (1..30000000) %}{{ r | size }}')).toBe('30000000')
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('assign accounting still charges strings when a limit is set', async function () {
    const limited = new Liquid({ assignLimit: 20 })
    await expect(limited.parseAndRender('{% assign a = s %}', { s: 'x'.repeat(30) })).rejects.toThrow(
      'assign limit exceeded'
    )
  })

  it('divided_by and modulo respect a decimal written on either side', async function () {
    expect(await liquid.parseAndRender('{{ 10.0 | divided_by: 3 }}')).toBe('3.3333333333333335')
    expect(await liquid.parseAndRender('{{ 10 | divided_by: 3.0 }}')).toBe('3.3333333333333335')
    expect(await liquid.parseAndRender('{{ 10 | divided_by: 3 }}')).toBe('3')
  })

  it('default accepts the zero-argument form', async function () {
    expect(await liquid.parseAndRender('[{{ nil | default }}]')).toBe('[]')
    expect(await liquid.parseAndRender('{{ nil | default: "x" }}')).toBe('x')
    await expect(liquid.parseAndRender('{{ nil | default: 1, 2, 3 }}')).rejects.toThrow('wrong number of arguments')
  })

  it('ifchanged charges the output budget once, and not for suppressed text', async function () {
    const limited = new Liquid({ outputLengthLimit: 6 })
    expect(await limited.parseAndRender('{% ifchanged %}abcde{% endifchanged %}')).toBe('abcde')
    const repeats = new Liquid({ outputLengthLimit: 8 })
    const src = '{% for i in items %}{% ifchanged %}{{ i }}{% endifchanged %}{% endfor %}'
    expect(await repeats.parseAndRender(src, { items: ['aaaa', 'aaaa', 'aaaa'] })).toBe('aaaa')
  })

  it('hosted json serializes a shared reference twice and only breaks true cycles', async function () {
    const engine = hosted()
    const shared = { n: 1 }
    expect(await engine.parseAndRender('{{ o | json }}', { o: { a: shared, b: shared } })).toBe(
      '{"a":{"n":1},"b":{"n":1}}'
    )
    expect(await engine.parseAndRender('{{ o | json }}', { o: [shared, shared] })).toBe('[{"n":1},{"n":1}]')
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic['self'] = cyclic
    expect(await engine.parseAndRender('{{ o | json }}', { o: cyclic })).toBe('{"a":1,"self":null}')
  })

  it('paginate replaces the collection at the path the body reads', async function () {
    const engine = hosted({ request: { path: '/p', query: {} } })
    const scope = { coll: { products: [1, 2, 3, 4], name: 'C' } }
    const body = '{{ coll.products | join: "," }}|{{ coll.name }}'
    // the canonical form re-reads the full path and must see the page
    expect(await engine.parseAndRender(`{% paginate coll.products by 2 %}${body}{% endpaginate %}`, scope)).toBe(
      '1,2|C'
    )
    expect(await engine.parseAndRender(`{% paginate coll['products'] by 2 %}${body}{% endpaginate %}`, scope)).toBe(
      '1,2|C'
    )
    // a plain identifier is shadowed the same way, and only inside the block
    expect(
      await engine.parseAndRender('{% paginate a by 2 %}{{ a | join: "," }}{% endpaginate %}|{{ a | size }}', {
        a: [1, 2, 3, 4]
      })
    ).toBe('1,2|4')
  })

  it('paginate accepts comma separated attributes', async function () {
    const engine = hosted({ request: { path: '/c', query: { p: '2', q: 'x' } } })
    const scope = { arr: [1, 2, 3, 4, 5, 6] }
    const body = '{{ paginate.current_page }}|{{ paginate.next.url }}'
    expect(await engine.parseAndRender(`{% paginate arr by 2, page_param: 'p' %}${body}{% endpaginate %}`, scope)).toBe(
      '2|/c?q=x&p=3'
    )
    expect(await engine.parseAndRender(`{% paginate arr by 2 page_param: 'p' %}${body}{% endpaginate %}`, scope)).toBe(
      '2|/c?q=x&p=3'
    )
  })

  it('uniq stays linear for primitive keys', async function () {
    const a = Array.from({ length: 20000 }, (_, i) => i % 10000)
    const start = Date.now()
    expect(await liquid.parseAndRender('{{ a | uniq | size }}', { a })).toBe('10000')
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('size counts entries rather than reading a data key named size', async function () {
    expect(await liquid.parseAndRender('{{ h | size }}', { h: { size: 9, a: 1 } })).toBe('2')
    expect(await liquid.parseAndRender('{{ m | size }}', { m: new Map([['a', 1]]) })).toBe('1')
  })

  it('default_pagination renders a gap distinctly from the current page', async function () {
    const engine = hosted({ request: { path: '/p', query: { page: '10' } } })
    const html = await engine.parseAndRender(
      '{% paginate arr by 10 window_size: 1 %}{{ paginate | default_pagination }}{% endpaginate %}',
      { arr: Array.from({ length: 200 }, (_, i) => i) }
    )
    expect(html).toContain('<span class="deco">&hellip;</span>')
    expect(html).toContain('<span class="page current">10</span>')
  })

  it('a section group key names the section unless the definition carries an id', async function () {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: { 'sections/a.liquid': '[{{ section.id }}]' },
      extname: '.liquid',
      theme: {
        sectionGroups: {
          g: { order: ['keyed', 'own'], sections: { keyed: { type: 'a' }, own: { type: 'a', id: 'explicit' } } }
        }
      }
    })
    expect(await engine.parseAndRender('{% sections "g" %}')).toBe(
      '<div id="shopify-section-keyed" class="shopify-section">[keyed]</div>' +
        '<div id="shopify-section-explicit" class="shopify-section">[explicit]</div>'
    )
  })

  it('raw-body tags belong to the profile that defines them', async function () {
    const core = new Liquid()
    // the core tokenizer does not swallow the rest of the file looking for an
    // end tag it has no reason to expect
    for (const name of ['schema', 'stylesheet', 'javascript']) {
      expect(() => core.parse(`{% ${name} %}`)).toThrow(`Unknown tag '${name}'`)
    }
    // {% raw %} keeps its verbatim body in every profile
    expect(await core.parseAndRender('{% raw %}{{ a }}{% endraw %}')).toBe('{{ a }}')
    const hostedEngine = hosted()
    expect(await hostedEngine.parseAndRender('{% javascript %}var a = {{ b }};{% endjavascript %}')).toBe('')
  })

  it('section identity reaches the markup escaped', async function () {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: { 'sections/a.liquid': '{{ block.shopify_attributes }}' },
      extname: '.liquid',
      theme: {
        sectionGroups: {
          g: { sections: { s: { type: 'a', id: 'x" onload="boom', blocks: [{ type: 't', id: 'b" onload="boom' }] } } }
        }
      }
    })
    const html = await engine.parseAndRender('{% sections "g" %}')
    expect(html).toContain('id="shopify-section-x&quot; onload=&quot;boom"')
    expect(html).not.toContain('onload="boom"')
  })
})

describe('regressions found in the third review', function () {
  const liquid = new Liquid()
  const hostedEngine = (theme: ThemeProviders = {}) => new Liquid({ profile: 'shopify_theme', theme })

  it('structured_data cannot close its own script element', async function () {
    const engine = hostedEngine()
    const html = await engine.parseAndRender('{{ p | structured_data }}', {
      p: { name: '</script><img src=x onerror=alert(1)>' }
    })
    expect(html).not.toContain('</script><img')
    expect(html).toBe(
      '<script type="application/ld+json">{"name":"\\u003c/script\\u003e\\u003cimg src=x onerror=alert(1)\\u003e"}</script>'
    )
    const payload = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'))
    expect(JSON.parse(payload)).toEqual({ name: '</script><img src=x onerror=alert(1)>' })
  })

  it('a range answers the members its materialized array would', async function () {
    expect(await liquid.parseAndRender('{{ (1..5).size }}')).toBe('5')
    expect(await liquid.parseAndRender('{{ (1..5).first }}|{{ (1..5).last }}|{{ (1..5)[1] }}')).toBe('1|5|2')
    expect(await liquid.parseAndRender('{% assign a = (1..3) %}{{ a[0] }}|{{ a.size }}|{{ a.last }}')).toBe('1|3|3')
    expect(await liquid.parseAndRender('{{ (1..5) | first }}|{{ (1..5) | last }}')).toBe('1|5')
    expect(await hostedEngine().parseAndRender('{{ (1..3) | json }}')).toBe('[1,2,3]')
    // and still exposes nothing of its own representation
    expect(await liquid.parseAndRender('[{{ (1..5).begin }}{{ (1..5).step }}{{ (1..5).length }}]')).toBe('[]')
  })

  it('the paginated flag reaches partials rendered from the block', async function () {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: { grid: '{% for i in items %}{{ i }},{% endfor %}' },
      theme: { request: { path: '/c', query: {} } }
    })
    const items = Array.from({ length: 120 }, (_, i) => i)
    const html = await engine.parseAndRender(
      '{% paginate items by 100 %}{% render "grid", items: items %}{% endpaginate %}',
      { items }
    )
    expect(html.split(',').length - 1).toBe(100)
    // outside a paginate block the documented cap still applies
    const capped = await engine.parseAndRender('{% render "grid", items: items %}', { items })
    expect(capped.split(',').length - 1).toBe(50)
  })

  it('a render-local tenant scopes the template cache', async function () {
    mock({ '/t/leaf.liquid': 'A' })
    const engine = new Liquid({ profile: 'shopify_theme', root: '/t', partials: '/t', extname: '.liquid', cache: true })
    expect(await engine.parseAndRender('{% render "leaf" %}', {}, { theme: { tenant: 'a' } })).toBe('A')
    mock({ '/t/leaf.liquid': 'B' })
    expect(await engine.parseAndRender('{% render "leaf" %}', {}, { theme: { tenant: 'b' } })).toBe('B')
    expect(await engine.parseAndRender('{% render "leaf" %}', {}, { theme: { tenant: 'a' } })).toBe('A')
  })

  it('a render-local filter map does not expose Object.prototype members', async function () {
    const strict = new Liquid({ strictFilters: true })
    const templates = strict.parse('{{ "x" | toString }}')
    await expect(strict.render(templates, {}, { filters: {} })).rejects.toThrow('undefined filter: toString')
    await expect(strict.render(templates, {}, { filters: { other: (v: string) => v } })).rejects.toThrow(
      'undefined filter: toString'
    )
    expect(await strict.render(templates, {}, { filters: { toString: () => 'ok' } })).toBe('ok')
  })

  it('hosted lookups read data, never prototype members', async function () {
    const engine = hostedEngine({
      locale: 'en',
      locales: { en: { translations: { greeting: 'hi' }, dateFormats: { short: '%Y' } } }
    })
    for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
      expect(await engine.parseAndRender(`{{ "${key}" | t }}`)).toBe(`translation missing: ${key}`)
      expect(await engine.parseAndRender(`{{ "2022-12-08" | date: format: "${key}" }}`)).toBe('2022-12-08')
    }
    expect(await engine.parseAndRender('{{ 1000 | weight_with_unit: "constructor" }}')).toBe('1000 g')
    expect(await engine.parseAndRender('{{ o | json }}', { o: { object_type: 'toString', a: 1 } })).toBe(
      '{"object_type":"toString","a":1}'
    )
    expect(await engine.parseAndRender('{{ "greeting" | t }}')).toBe('hi')
    expect(await engine.parseAndRender('{{ "2022-12-08" | date: format: "short" }}')).toBe('2022')
  })

  it('colour filters report nothing for a missing or unreadable amount', async function () {
    const engine = hostedEngine()
    for (const src of [
      '{{ "#ff0000" | color_lighten }}',
      '{{ "#ff0000" | color_darken }}',
      '{{ "#ff0000" | color_saturate }}',
      '{{ "#ff0000" | color_desaturate }}',
      '{{ "#ff0000" | color_lighten: "abc" }}',
      '{{ "#ff0000" | color_modify: "red" }}',
      '{{ "#ff0000" | color_mix: "#00ff00" }}'
    ]) {
      expect(await engine.parseAndRender(src)).toBe('')
    }
    expect(await engine.parseAndRender('{{ "#ff0000" | color_lighten: 10 }}')).toBe('#ff3333')
    expect(await engine.parseAndRender('{{ "#000000" | color_mix: "#ffffff", 50 }}')).toBe('#808080')
  })

  it('keyword-only filters ignore a stray positional argument', async function () {
    const engine = hostedEngine({ locale: 'en', locales: { en: { translations: { greeting: 'hi' } } } })
    expect(await engine.parseAndRender('{{ "greeting" | t: "fallback" }}')).toBe('hi')
    expect(await engine.parseAndRender('{{ p | default_pagination: 5 }}', { p: { parts: [] } })).toBe('')
    expect(await engine.parseAndRender('{{ "/a.js" | preload_tag: "script", 5 }}')).toBe(
      '<link href="/a.js" as="script" rel="preload" />'
    )
  })

  it('line_items_for tolerates a non-object subject', async function () {
    const engine = hostedEngine()
    const cart = { items: [{ variant_id: 1, quantity: 2 }] }
    expect(await engine.parseAndRender('{{ cart | line_items_for: "abc" | size }}', { cart })).toBe('0')
    expect(await engine.parseAndRender('{{ cart | line_items_for: 7 | size }}', { cart })).toBe('0')
    expect(await engine.parseAndRender('{{ cart | line_items_for: v | size }}', { cart, v: { id: 1 } })).toBe('1')
  })

  it('url_decode handles characters outside the basic plane', async function () {
    expect(await liquid.parseAndRender('{{ s | url_decode }}', { s: '😀' })).toBe('😀')
    expect(await liquid.parseAndRender('{{ "%F0%9F%98%80" | url_decode }}')).toBe('😀')
    expect(await liquid.parseAndRender('{{ s | url_decode }}', { s: 'a😀%zz' })).toBe('a😀%zz')
  })

  it('a render-local tenant scopes the cache of the root template too', async function () {
    mock({ '/t/index.liquid': 'A' })
    const engine = new Liquid({ root: '/t', extname: '.liquid', cache: true })
    expect(await engine.renderFile('index', {}, { theme: { tenant: 'a' } })).toBe('A')
    mock({ '/t/index.liquid': 'B' })
    expect(await engine.renderFile('index', {}, { theme: { tenant: 'b' } })).toBe('B')
    expect(await engine.renderFile('index', {}, { theme: { tenant: 'a' } })).toBe('A')
  })

  it('paginate over a nested path keeps the containing object usable', async function () {
    class Collection extends Drop {
      public products = [1, 2, 3, 4]
      public get title() {
        return 'T'
      }
      public handle() {
        return 'h'
      }
    }
    const engine = hosted()
    expect(
      await engine.parseAndRender(
        '{% paginate collection.products by 2 %}[{{ collection.title }}][{{ collection.handle }}]' +
          '{% for p in collection.products %}{{ p }}{% endfor %}{% endpaginate %}',
        { collection: new Collection() }
      )
    ).toBe('[T][h]12')
  })

  it('a partial rebinding a name does not release the caller assign budget', async function () {
    const engine = new Liquid({ assignLimit: 100, templates: { p: '{% assign a = "x" %}' } })
    await expect(
      engine.parseAndRender('{% assign a = big %}{% render "p" %}{% assign b = big %}', { big: 'y'.repeat(90) })
    ).rejects.toThrow('assign limit exceeded')
    await expect(
      engine.parseAndRender('{% assign a = big %}{% assign a = big %}{{ a | size }}', { big: 'y'.repeat(90) })
    ).rejects.toThrow('assign limit exceeded')
  })

  it('a binary operator missing its left operand keeps its two-operand signature', async function () {
    const seen: unknown[][] = []
    const engine = new Liquid({
      errorMode: 'lax',
      operators: { ...defaultOperators, pair: (l: unknown, r: unknown) => (seen.push([l, r]), true) }
    })
    await engine.parseAndRender('{% if pair 2 %}y{% endif %}')
    expect(seen).toEqual([[undefined, 2]])
  })
})
