import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop/drop'
import { mock, restore } from '../../stub/mockfs'

describe('tags/include', function () {
  let liquid: Liquid
  beforeEach(function () {
    liquid = new Liquid({
      root: '/',
      extname: '.html'
    })
  })
  afterEach(restore)
  it('should support include', async function () {
    mock({
      '/current.html': 'bar{% include "bar/foo.html" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html')
    return expect(html).toBe('barfoobar')
  })
  it('should support relative reference', async function () {
    mock({
      '/foo/bar/current.html': 'bar{% include "../coo/foo.html" %}bar',
      '/foo/coo/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/foo/bar/current.html')
    return expect(html).toBe('barfoobar')
  })
  it('should support template string', async function () {
    mock({
      '/current.html': 'bar{% include "bar/{{name}}" %}bar',
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html', { name: 'foo.html' })
    return expect(html).toBe('barfoobar')
  })
  it('should allow a quoted string in a template string', async function () {
    mock({
      '/current.html': `bar{% include "bar/{{name | append: '.html'}}" %}bar`,
      '/bar/foo.html': 'foo'
    })
    const html = await liquid.renderFile('/current.html', { name: 'foo' })
    return expect(html).toBe('barfoobar')
  })

  it('should throw when not specified', function () {
    mock({
      '/parent.html': '{%include , %}'
    })
    const warn = new Liquid({ root: '/', extname: '.html', errorMode: 'warn' })
    return warn.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('TokenizationError')
      expect(e.message).toMatch(/illegal file path, file:.*parent.html, line:1, col:11/)
    })
  })

  it('should throw when not exist', function () {
    mock({
      '/parent.html': '{%include not-exist%}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('RenderError')
      expect(e.message).toMatch(/Argument error in tag 'include' - Illegal template name/)
    })
  })

  it('should support include with relative path', async function () {
    mock({
      '/bar/foo.html': 'foo',
      '/foo/relative.html': 'bar{% include "../bar/foo.html" %}bar'
    })
    const html = await liquid.renderFile('foo/relative.html')
    return expect(html).toBe('barfoobar')
  })

  it('should support include: hash list', async function () {
    mock({
      '/hash.html': '{% assign name="harttle" %}{% include "user.html", role: "admin", alias: name %}',
      '/user.html': '{{name}} : {{role}} : {{alias}}'
    })
    const html = await liquid.renderFile('hash.html')
    return expect(html).toBe('harttle : admin : harttle')
  })

  it('should support include: parent scope', async function () {
    mock({
      '/scope.html': '{% assign shape="triangle" %}{% assign color="yellow" %}{% include "color.html" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('scope.html')
    return expect(html).toBe('color:yellow, shape:triangle')
  })

  it('should support include: with', async function () {
    mock({
      '/with.html': '{% include "color" with "red", shape: "rect" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('color:red, shape:rect')
  })
  it('should ignore if with value not specified', async function () {
    mock({
      '/with.html': '{% include "color" with, shape: "rect" %}',
      '/color.html': 'color:{{color}}, shape:{{shape}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('color:, shape:rect')
  })
  it('should treat with as a valid key', async function () {
    mock({
      '/with.html': '{% include "color" with: "foo" %}',
      '/color.html': 'with:{{with}}'
    })
    const html = await liquid.renderFile('with.html')
    return expect(html).toBe('with:foo')
  })
  it('should support include: with as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf(): string {
        return 'red!'
      }
    }
    mock({
      '/with.html': '{% include "color" with color %}',
      '/color.html': 'color:{{color}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('color:red!')
  })
  it('should support include: with passed as Drop', async function () {
    class ColorDrop extends Drop {
      public valueOf(): string {
        return 'red!'
      }
    }
    liquid.registerFilter('name', x => x.constructor.name)
    mock({
      '/with.html': '{% include "color" with color %}',
      '/color.html': '{{color | name}}'
    })
    const html = await liquid.renderFile('with.html', { color: new ColorDrop() })
    expect(html).toBe('ColorDrop')
  })

  it('should support nested includes', async function () {
    mock({
      '/personInfo.html': 'This is a person {% include "card.html" %}',
      '/card.html': '<p>{{person.firstName}} {{person.lastName}}<br/>{% include "address" %}</p>',
      '/address.html': 'City: {{person.address.city}}'
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
    return expect(html).toBe('This is a person <p>Joe Shmoe<br/>City: Dallas</p>')
  })

  describe('sync support', function () {
    it('should support quoted string', async function () {
      mock({
        '/current.html': 'bar{% include "bar/foo.html" %}bar',
        '/bar/foo.html': 'foo'
      })
      const html = await liquid.renderFile('/current.html')
      return expect(html).toBe('barfoobar')
    })
    it('should support variable', async function () {
      mock({
        '/current.html': 'bar{% include name %}bar',
        '/bar/foo.html': 'foo'
      })
      const html = await liquid.renderFile('/current.html', { name: '/bar/foo.html' })
      return expect(html).toBe('barfoobar')
    })
    it('should support include: with', async function () {
      mock({
        '/with.html': '{% include "color" with "red", shape: "rect" %}',
        '/color.html': 'color:{{color}}, shape:{{shape}}'
      })
      const html = await liquid.renderFile('with.html')
      return expect(html).toBe('color:red, shape:rect')
    })
  })
})
