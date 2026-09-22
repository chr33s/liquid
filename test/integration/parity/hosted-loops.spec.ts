import { Liquid } from '../../../src/liquid'
import type { ThemeProviders } from '../../../src/theme'

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

describe('parity: hosted loop and pagination limits', function () {
  const core = new Liquid()
  const hosted = (theme: ThemeProviders = {}) => new Liquid({ profile: 'shopify_theme', theme })

  it('H23: an ordinary hosted for renders at most 50 items', async function () {
    const engine = hosted()
    const src = '{% for i in arr %}{{ i }},{% endfor %}'
    expect((await engine.parseAndRender(src, { arr: items(49) })).split(',').length - 1).toBe(49)
    expect((await engine.parseAndRender(src, { arr: items(50) })).split(',').length - 1).toBe(50)
    expect((await engine.parseAndRender(src, { arr: items(51) })).split(',').length - 1).toBe(50)
  })

  it('H23: a range is not capped, as recorded from production', async function () {
    const html = await hosted().parseAndRender('{% for i in (1..60) %}{{ i }},{% endfor %}')
    expect(html.split(',').length - 1).toBe(60)
  })

  it('H23: an explicit limit is honoured above the default cap', async function () {
    const engine = hosted()
    const html = await engine.parseAndRender('{% for i in (1..60) limit: 55 %}{{ i }},{% endfor %}')
    expect(html.split(',').length - 1).toBe(55)
  })

  it('H23: the core profile is unmodified', async function () {
    const html = await core.parseAndRender('{% for i in (1..60) %}{{ i }},{% endfor %}')
    expect(html.split(',').length - 1).toBe(60)
  })

  it('H24: page size boundaries are enforced', async function () {
    const engine = hosted({ request: { path: '/c', query: {} } })
    const src = (by: number) => `{% paginate arr by ${by} %}{{ paginate.page_size }}{% endpaginate %}`
    expect(await engine.parseAndRender(src(1), { arr: items(10) })).toBe('1')
    expect(await engine.parseAndRender(src(250), { arr: items(10) })).toBe('250')
    await expect(engine.parseAndRender(src(0), { arr: items(10) })).rejects.toThrow(
      /page size must be between 1 and 250/
    )
    await expect(engine.parseAndRender(src(251), { arr: items(10) })).rejects.toThrow(
      /page size must be between 1 and 250/
    )
  })

  it('H25: an inner for inside paginate is not clamped to 50', async function () {
    const engine = hosted({ request: { path: '/c', query: {} } })
    const src = '{% paginate arr by 60 %}{% for i in arr %}{{ i }},{% endfor %}{% endpaginate %}'
    const html = await engine.parseAndRender(src, { arr: items(120) })
    expect(html.split(',').length - 1).toBe(60)
  })

  it('H26: page state comes from the request query', async function () {
    const engine = hosted({ request: { path: '/collections/all', query: { page: '3', sort: 'asc' } } })
    const src =
      '{% paginate arr by 10 %}{{ paginate.current_page }}|{{ paginate.pages }}|{{ paginate.items }}|{{ arr | join: "," }}|{{ paginate.next.url }}{% endpaginate %}'
    const html = await engine.parseAndRender(src, { arr: items(45) })
    expect(html).toBe('3|5|45|21,22,23,24,25,26,27,28,29,30|/collections/all?sort=asc&page=4')
  })

  it.each([
    Object.freeze({ products: [1, 2, 3], title: 'Collection' }),
    Object.freeze({
      get products() {
        return [1, 2, 3]
      },
      title: 'Collection'
    })
  ])('paginates through frozen parents without changing the input', async function (collection) {
    const engine = hosted({ request: { query: { page: '2' } } })
    const catalog = Object.freeze({ collection })
    const src =
      '{% paginate catalog.collection.products by 2 %}{{ catalog.collection.title }}:{{ catalog.collection.products | join: "," }}{% endpaginate %}' +
      '|{{ catalog.collection.products | join: "," }}'
    expect(await engine.parseAndRender(src, { catalog })).toBe('Collection:3|1,2,3')
    expect(collection.products).toEqual([1, 2, 3])
  })

  it('H26: page_param scopes independent paginations', async function () {
    const engine = hosted({ request: { path: '/p', query: { a: '2', b: '3' } } })
    const src =
      '{% paginate arr by 10 page_param: "a" %}{{ paginate.current_page }}{% endpaginate %}' +
      '{% paginate arr by 10 page_param: "b" %}{{ paginate.current_page }}{% endpaginate %}'
    expect(await engine.parseAndRender(src, { arr: items(100) })).toBe('23')
  })

  it('H27: pagination stops at the documented item ceiling', async function () {
    const engine = hosted({ request: { path: '/p', query: {} } })
    const src = '{% paginate arr by 10 %}{{ paginate.items }}|{{ paginate.pages }}{% endpaginate %}'
    const arr = { size: 30000, slice: (from: number, to: number) => items(to - from) }
    expect(
      await new Liquid({
        profile: 'shopify_theme',
        theme: { request: { path: '/p', query: {} }, store: { paginate: () => arr } }
      }).parseAndRender(src, { arr: [] })
    ).toBe('25000|2500')
    void engine
  })

  it('H27: window_size controls the part list without changing fetching', async function () {
    let fetched = 0
    const engine = new Liquid({
      profile: 'shopify_theme',
      theme: {
        request: { path: '/p', query: { page: '10' } },
        store: {
          paginate: () => ({
            size: 200,
            slice: (from: number, to: number) => {
              fetched = to - from
              return items(to - from)
            }
          })
        }
      }
    })
    const src =
      '{% paginate arr by 10 window_size: 1 %}{{ paginate.parts | map: "title" | join: "," }}{% endpaginate %}'
    expect(await engine.parseAndRender(src, { arr: [] })).toBe('1,&hellip;,9,10,11,&hellip;,20')
    expect(fetched).toBe(10)
  })

  it('H27: paginate is unavailable outside the hosted profile', async function () {
    await expect(core.parseAndRender('{% paginate a by 2 %}{% endpaginate %}', { a: [1] })).rejects.toThrow(
      "Unknown tag 'paginate'"
    )
  })
})

describe('parity: core loop arguments and interrupts', function () {
  const liquid = new Liquid()

  it('T24: tablerow consumes break and continue without suppressing later text', async function () {
    expect(
      await liquid.parseAndRender('{% tablerow i in (1..4) cols:2 %}{{ i }}{% break %}{% endtablerow %}AFTER')
    ).toBe('<tr class="row1">\n<td class="col1">1</td></tr>\nAFTER')
    expect(
      await liquid.parseAndRender('{% tablerow i in (1..2) cols:2 %}{% continue %}{{ i }}{% endtablerow %}AFTER')
    ).toBe('<tr class="row1">\n<td class="col1"></td><td class="col2"></td></tr>\nAFTER')
  })

  it('T24: a break inside a for does not suppress the text after the loop', async function () {
    expect(await liquid.parseAndRender('{% for i in (1..3) %}{{ i }}{% break %}{% endfor %}AFTER')).toBe('1AFTER')
  })

  it('T25: an initial offset:continue starts at zero and later loops resume', async function () {
    const arr = [1, 2, 3, 4, 5]
    expect(await liquid.parseAndRender('{% for i in arr offset: continue %}{{ i }}{% endfor %}', { arr })).toBe('12345')
    const src = '{% for i in arr limit:2 %}{{ i }}{% endfor %}-{% for i in arr offset:continue %}{{ i }}{% endfor %}'
    expect(await liquid.parseAndRender(src, { arr })).toBe('12-345')
  })

  it('T26: loop arguments convert like the reference', async function () {
    // a decimal is not an integer, and a string spelling one is
    await expect(liquid.parseAndRender('{% for i in (1..5) limit: 2.9 %}{{ i }}{% endfor %}')).rejects.toThrow(
      'invalid integer'
    )
    expect(await liquid.parseAndRender('{% for i in (1..5) offset: " 1 " %}{{ i }}{% endfor %}')).toBe('2345')
    // a negative limit selects nothing, a negative offset starts at the beginning
    expect(await liquid.parseAndRender('{% for i in (1..5) limit: -1 %}{{ i }}{% endfor %}')).toBe('')
    expect(await liquid.parseAndRender('{% for i in (1..5) offset: -2 %}{{ i }}{% endfor %}')).toBe('12345')
    // an unreadable argument is an error, not a silent zero
    await expect(liquid.parseAndRender('{% for i in (1..5) limit: "x" %}{{ i }}{% endfor %}')).rejects.toThrow(
      'invalid integer'
    )
    // tablerow reads its attributes loosely, as the reference's `to_i`
    await expect(liquid.parseAndRender('{% tablerow i in (1..2) cols: "x" %}{% endtablerow %}')).resolves.toBe(
      '<tr class="row1">\n<td class="col1"></td><td class="col2"></td></tr>\n'
    )
  })
})
