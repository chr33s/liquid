import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop/drop'
import { mock, restore } from '../../stub/mockfs'

describe('tags/render', function () {
  let liquid: Liquid
  beforeEach(function () {
    liquid = new Liquid({
      root: '/',
      extname: '.html'
    })
  })
  afterEach(restore)
  it('should support render', async function () {
    mock({
      '/current.html': 'bar{% render "bar/foo.html" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html')
    expect(html).toBe('barfoobar')
  })
  it('should support render', async function () {
    mock({
      '/current.html': 'bar{% render "foo.html" %}bar',
      '/partials/foo.html': 'foo'
    })
    const liquid = new Liquid({ partials: '/partials', root: '/' })
    const html = await liquid.renderFile('/current.html')
    expect(html).toBe('barfoobar')
  })
  it('T14: a quoted filename with Liquid delimiters is a literal name', async function () {
    mock({
      '/current.html': 'bar{% render "bar/{{name}}" %}bar',
      '/bar/{{name}}.html': 'literal',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html', { name: 'foo.html' })
    expect(html).toBe('barliteralbar')
  })

  it('T13: a variable filename is rejected', async function () {
    mock({
      '/parent.html': '{% render name %}',
      '/foo.html': 'foo'
    })
    return expect(liquid.renderFile('/parent.html', { name: 'foo.html' })).rejects.toThrow(
      /Template name must be a quoted string/
    )
  })

  it('T15: render binds "with" under the snippet basename', async function () {
    mock({
      '/index.html': '{% render "cards/item" with product %}',
      '/cards/item.html': 'item:{{ item }}'
    })
    const html = await liquid.renderFile('/index.html', { product: 'shoe' })
    expect(html).toBe('item:shoe')
  })

  it('T17: render-for iterations are isolated from each other', async function () {
    mock({
      '/index.html': '{% render "item" for colors as color %}',
      '/item.html': '{{ seen }}{% assign seen = "X" %}{% increment c %}'
    })
    const html = await liquid.renderFile('/index.html', { colors: ['red', 'green'] })
    expect(html).toBe('00')
  })

  it('T18: include is disabled inside render, and restored afterwards', async function () {
    mock({
      '/index.html': '{% render "outer" %}|{% include "leaf" %}',
      '/outer.html': '{% include "leaf" %}',
      '/leaf.html': 'leaf'
    })
    await expect(liquid.renderFile('/index.html')).rejects.toThrow('include usage is not allowed in this context')
    const html = await liquid.renderFile('/index.html', {}, { renderErrors: 'inline' })
    expect(html).toBe('Liquid error (/outer.html line 1): include usage is not allowed in this context|leaf')
  })

  it('T18: the disabled state is restored after a failure inside render', async function () {
    mock({
      '/index.html': '{% render "boom" %}',
      '/boom.html': '{{ 1 | throws }}',
      '/leaf.html': 'leaf'
    })
    liquid.registerFilter('throws', () => {
      throw new Error('boom')
    })
    await expect(liquid.renderFile('/index.html')).rejects.toThrow('boom')
    await expect(liquid.renderFile('/index.html', {})).rejects.toThrow('boom')
    mock({ '/index2.html': '{% include "leaf" %}', '/leaf.html': 'leaf' })
    await expect(liquid.renderFile('/index2.html')).resolves.toBe('leaf')
  })

  it('should throw when not specified', async function () {
    mock({
      '/parent.html': '{%render%}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('ParseError')
      expect(e.message).toMatch(/Template name must be a quoted string/)
    })
  })

  it('should throw when not exist', async function () {
    mock({
      '/parent.html': '{%render "not-exist"%}'
    })
    return expect(liquid.renderFile('/parent.html')).rejects.toThrow(/Failed to lookup/)
  })

  it('should support render with relative path', async function () {
    mock({
      '/bar/foo.html': 'foo',
      '/foo/relative.html': 'bar{% render "../bar/foo.html" %}bar'
    })
    const html = await liquid.renderFile('foo/relative.html')
    expect(html).toBe('barfoobar')
  })

  it('should support render: hash list', async function () {
    mock({
      '/hash.html': '{% assign name="harttle" %}{% render "user.html", role: "admin", alias: name %}',
      '/user.html': '{{role}} : {{alias}}'
    })
    const html = await liquid.renderFile('hash.html')
    expect(html).toBe('admin : harttle')
  })

  it('should not bleed into child template', async function () {
    mock({
      '/hash.html': '{% assign name="harttle" %}InParent: {{name}} {% render "user.html" %}',
      '/user.html': 'InChild: {{name}}'
    })
    const html = await liquid.renderFile('hash.html')
    expect(html).toBe('InParent: harttle InChild: ')
  })

  it('should allow argument reassignment', async function () {
    mock({
      '/parent.html': '{% render "child.html", color: "red" %}',
      '/child.html': '{% assign color = "green" %}{{ color }}'
    })
    const html = await new Liquid({ root: '/' }).renderFile('parent.html')
    return expect(html).toBe('green')
  })

  it('should be able to access globals', async function () {
    liquid = new Liquid({ root: '/', extname: '.html', globals: { name: 'Harttle' } })
    mock({
      '/hash.html': 'InParent: {{name}} {% render "user.html" %}',
      '/user.html': 'InChild: {{name}}'
    })
    const html = await liquid.renderFile('hash', { name: 'harttle' })
    expect(html).toBe('InParent: harttle InChild: Harttle')
  })

  it('should support with', async function () {
    mock({
      '/with.html': '{% render "color" with "red", shape: "rect" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    expect(html).toBe('color:red, shape:rect')
  })
  it('should treat as normal key/value if followed by ":"', async () => {
    mock({
      '/with.html': '{% render "color" with: "foo" %}',
      '/color.html': 'color:{{color}}, with:{{with}}'
    })
    const html = await liquid.renderFile('with.html')
    expect(html).toBe('color:, with:foo')
  })
  it('a bare with binds nothing, as in the reference', async () => {
    mock({
      '/with.html': '{% render "color" with, shape: "rect" %}',
      '/color.html': 'color:{{color}}, with:{{with}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    expect(html).toBe('color:, with:, shape:rect')
  })
  it('should support with...as', async function () {
    mock({
      '/with.html': '{% render "color" with color as c %}',
      '/color.html': 'color:{{c}}'
    })
    const html = await liquid.renderFile('with.html', { color: 'red' })
    expect(html).toBe('color:red')
  })
  it('should support with...as and other parameters', async function () {
    mock({
      '/index.html': '{% render "item" with color as c, s: shape %}',
      '/item.html': 'color:{{c}}, shape:{{s}}'
    })
    const scope = { color: 'red', shape: 'rect' }
    const html = await liquid.renderFile('index.html', scope)
    expect(html).toBe('color:red, shape:rect')
  })
  it('should support for...as', async function () {
    mock({
      '/index.html': '{% render "item" for colors as color %}',
      '/item.html': '{{forloop.index}}: {{color}}\n'
    })
    const html = await liquid.renderFile('index.html', { colors: ['red', 'green'] })
    expect(html).toBe('1: red\n2: green\n')
  })
  it('should support for <iterable> as', async function () {
    class MockIterable {
      *[Symbol.iterator]() {
        yield 'red'
        yield 'green'
      }
    }
    mock({
      '/index.html': '{% render "item" for colors as color %}',
      '/item.html': '{{forloop.index}}: {{color}}\n'
    })
    const html = await liquid.renderFile('index.html', { colors: new MockIterable() })
    expect(html).toBe('1: red\n2: green\n')
  })
  it('should render a non-iterable for binding once, without a forloop', async function () {
    mock({
      '/index.html': '{% render "item" for "green" as color %}',
      '/item.html': '{{forloop.index}}: {{color}}\n'
    })
    const html = await liquid.renderFile('index.html')
    expect(html).toBe(': green\n')
  })
  it('T16: for without as binds each item under the snippet basename', async function () {
    mock({
      '/index.html': '{% render "item" for colors %}',
      '/item.html': '{{forloop.index}}: {{item}}\n'
    })
    const html = await liquid.renderFile('index.html', { colors: ['red', 'green'] })
    expect(html).toBe('1: red\n2: green\n')
  })
  it('should support for...as with other parameters', async function () {
    mock({
      '/index.html': '{% render "item" for colors as color with ".\n" as tail sep: ". "%}',
      '/item.html': '{{forloop.index}}{{sep}}{{color}}{{tail}}'
    })
    const html = await liquid.renderFile('index.html', { colors: ['red', 'green'] })
    expect(html).toBe('1. red.\n2. green.\n')
  })
  it('should support for...as with other parameters (comma separated)', async function () {
    mock({
      '/index.html': '{% render "item" for colors as color, with ".\n" as tail, sep: ". "%}',
      '/item.html': '{{forloop.index}}{{sep}}{{color}}{{tail}}'
    })
    const html = await liquid.renderFile('index.html', { colors: ['red', 'green'] })
    expect(html).toBe('1. red.\n2. green.\n')
  })
  it('should support render: with as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf(): string {
        return 'red!'
      }
    }
    mock({
      '/with.html': '{% render "color" with color %}',
      '/color.html': 'color:{{color}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('color:red!')
  })
  it('should support render: with passed as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf(): string {
        return 'red!'
      }
    }
    liquid.registerFilter('name', x => x.constructor.name)
    mock({
      '/with.html': '{% render "color" with color %}',
      '/color.html': '{{color | name}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('ColorDrop')
  })

  it('should support nested renders', async function () {
    mock({
      '/personInfo.html': 'This is a person {% render "card.html", person: person%}',
      '/card.html':
        '<p>{{person.firstName}} {{person.lastName}}<br/>{% render "address", address: person.address %}</p>',
      '/address.html': 'City: {{address.city}}'
    })
    const ctx = {
      person: {
        firstName: 'Joe',
        lastName: 'Shmoe',
        address: {
          city: 'Dallas'
        }
      }
    }
    const html = await liquid.renderFile('personInfo.html', ctx)
    expect(html).toBe('This is a person <p>Joe Shmoe<br/>City: Dallas</p>')
  })
  it('should support relative reference', async function () {
    mock({
      '/foo/coo/parent.html': 'X{% render "../bar/child.html", color:"red" %}Y',
      '/foo/bar/child.html': 'child with {{color}}'
    })
    const staticLiquid = new Liquid({ root: '/foo' })
    const html = await staticLiquid.renderFile('coo/parent.html')
    expect(html).toBe('Xchild with redY')
  })
  it('should disable relative reference if specified', async () => {
    mock({
      '/foo/coo/parent.html': 'X{% render "../bar/child.html", color:"red" %}Y',
      '/foo/bar/child.html': 'child with {{color}}'
    })
    const staticLiquid = new Liquid({ root: '/foo', relativeReference: false })
    return expect(staticLiquid.renderFile('coo/parent.html')).rejects.toThrow(/Failed to lookup/)
  })
  it('should throw not found if relative reference out of root', async () => {
    mock({
      '/foo/parent.html': 'X{% render "../bar/child.html", color:"red" %}Y',
      '/bar/child.html': 'child with {{color}}'
    })
    const staticLiquid = new Liquid({ root: '/foo', partials: '/foo' })
    return expect(staticLiquid.renderFile('parent.html')).rejects.toThrow(/Failed to lookup "..\/bar\/child.html"/)
  })

  describe('per-render ownPropertyOnly', function () {
    it('should propagate to {% render %} partial (spawned context)', async function () {
      mock({
        '/_user.liquid': '{{ user.passwordHash }}'
      })
      const engine = new Liquid({ ownPropertyOnly: false, root: '/' })
      class User {
        name: string
        constructor(n: string) {
          this.name = n
        }
      }
      Object.assign(User.prototype, { passwordHash: 'secret-from-prototype' })
      const u = new User('alice')
      const tpl = 'Direct:[{{ user.passwordHash }}] Render:[{% render "_user.liquid", user: user %}]'
      const html = await engine.parseAndRender(tpl, { user: u }, { ownPropertyOnly: true })
      expect(html).toBe('Direct:[] Render:[]')
      expect(await engine.parseAndRender(tpl, { user: u }, { ownPropertyOnly: true })).toBe('Direct:[] Render:[]')
    })
  })

  describe('template name resolution', function () {
    let engine: Liquid
    beforeEach(() => {
      engine = new Liquid({ root: '/' })
    })
    it('should support filename with extension', async function () {
      mock({
        '/parent.html': 'X{% render "child.html" color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const html = await engine.renderFile('parent.html')
      expect(html).toBe('Xchild with redY')
    })

    it('should support parent paths', async function () {
      mock({
        '/parent.html': 'X{% render "bar/./../foo/child.html" %}Y',
        '/foo/child.html': 'child'
      })
      const html = await engine.renderFile('parent.html')
      expect(html).toBe('XchildY')
    })

    it('should support subpaths', async function () {
      mock({
        '/parent.html': 'X{% render "foo/child.html" %}Y',
        '/foo/child.html': 'child'
      })
      const html = await engine.renderFile('parent.html')
      expect(html).toBe('XchildY')
    })

    it('should support comma separated arguments', async function () {
      mock({
        '/parent.html': 'X{% render "child.html", color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const html = await engine.renderFile('parent.html')
      expect(html).toBe('Xchild with redY')
    })
  })
  describe('partial bindings', function () {
    it('should support quoted string', async function () {
      mock({
        '/current.html': 'bar{% render "bar/foo.html" %}bar',
        '/bar/foo.html': 'foo'
      })
      const html = await liquid.renderFile('/current.html')
      expect(html).toBe('barfoobar')
    })
    it('should reject a value string', async function () {
      mock({
        '/current.html': 'bar{% render name %}bar',
        '/bar/foo.html': 'foo'
      })
      await expect(liquid.renderFile('/current.html', { name: '/bar/foo.html' })).rejects.toThrow(
        /Template name must be a quoted string/
      )
    })
    it('should support with', async function () {
      mock({
        '/with.html': '{% render "color" with "red", shape: "rect" %}',
        '/color.html': 'color:{{color}}, shape:{{shape}}'
      })
      const html = await liquid.renderFile('with.html')
      expect(html).toBe('color:red, shape:rect')
    })
    it('should support filename with extension', async function () {
      mock({
        '/parent.html': 'X{% render "child.html" color:"red" %}Y',
        '/child.html': 'child with {{color}}'
      })
      const html = await new Liquid({ root: '/' }).renderFile('parent.html')
      expect(html).toBe('Xchild with redY')
    })
  })
})
