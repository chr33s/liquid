import { Liquid } from '../../../src/liquid'
import { mock, restore } from '../../stub/mockfs'

describe('parity: context, drops and partials', function () {
  afterEach(restore)

  it('T19: include still accepts an expression-valued filename', async function () {
    mock({ '/index.html': '{% include name %}', '/leaf.html': 'leaf' })
    const engine = new Liquid({ root: '/', extname: '.html' })
    expect(await engine.renderFile('/index.html', { name: 'leaf' })).toBe('leaf')
  })

  it('T20: include binds "with" under the template basename', async function () {
    mock({ '/index.html': '{% include "cards/item" with product %}', '/cards/item.html': '[{{ item }}]' })
    const engine = new Liquid({ root: '/', extname: '.html' })
    expect(await engine.renderFile('/index.html', { product: 'shoe' })).toBe('[shoe]')
  })

  it('T20: include supports "as" to rename the binding', async function () {
    mock({ '/index.html': '{% include "cards/item" with product as p %}', '/cards/item.html': '[{{ p }}]' })
    const engine = new Liquid({ root: '/', extname: '.html' })
    expect(await engine.renderFile('/index.html', { product: 'shoe' })).toBe('[shoe]')
  })

  it('T20: include with an array iterates the partial', async function () {
    mock({ '/index.html': '{% include "item" for colors %}', '/item.html': '[{{ item }}]' })
    const engine = new Liquid({ root: '/', extname: '.html' })
    expect(await engine.renderFile('/index.html', { colors: ['red', 'green'] })).toBe('[red][green]')
  })

  it('T20: include for an array honours "as"', async function () {
    mock({ '/index.html': '{% include "item" for colors as c %}', '/item.html': '[{{ c }}]' })
    const engine = new Liquid({ root: '/', extname: '.html' })
    expect(await engine.renderFile('/index.html', { colors: ['red', 'green'] })).toBe('[red][green]')
  })

  it('T21: forloop.parentloop reports the enclosing loop', async function () {
    const engine = new Liquid()
    const src =
      '{% for i in (1..2) %}{% for j in (1..2) %}{{ forloop.parentloop.index }}{{ forloop.index }} {% endfor %}{% endfor %}'
    expect(await engine.parseAndRender(src)).toBe('11 12 21 22 ')
  })

  it('T21: forloop.parentloop is nil at the top level', async function () {
    const engine = new Liquid()
    expect(await engine.parseAndRender('{% for i in (1..2) %}[{{ forloop.parentloop }}]{% endfor %}')).toBe('[][]')
    expect(
      await engine.parseAndRender('{% for i in (1..2) %}{% if forloop.parentloop %}y{% else %}n{% endif %}{% endfor %}')
    ).toBe('nn')
  })

  it('T22: reading internal forloop members cannot mutate the loop', async function () {
    const engine = new Liquid()
    const src = '{% for i in (1..3) %}{{ forloop.next }}{{ forloop.i }}{{ forloop.index }}{% endfor %}'
    expect(await engine.parseAndRender(src)).toBe('123')
  })

  it('T22: prototype and constructor members are not reachable on drops', async function () {
    const engine = new Liquid()
    const src =
      '{% for i in (1..1) %}[{{ forloop.constructor }}][{{ forloop.prototype }}][{{ forloop.__proto__ }}]{% endfor %}'
    expect(await engine.parseAndRender(src)).toBe('[][][]')
  })

  it('T22: tablerowloop internals are hidden too', async function () {
    const engine = new Liquid()
    const src =
      '{% tablerow i in (1..2) cols:2 %}{{ tablerowloop.next }}{{ tablerowloop.cols }}{{ tablerowloop.col }}{% endtablerow %}'
    const html = await engine.parseAndRender(src)
    expect(html).toBe('<tr class="row1">\n<td class="col1">1</td><td class="col2">2</td></tr>\n')
  })

  it('H36: render sees globals but not the caller locals', async function () {
    mock({ '/index.html': '{% assign local = "L" %}{% render "leaf" %}', '/leaf.html': '[{{ shop }}][{{ local }}]' })
    const engine = new Liquid({ root: '/', extname: '.html', globals: { shop: 'acme' } })
    expect(await engine.renderFile('/index.html')).toBe('[acme][]')
  })
})
