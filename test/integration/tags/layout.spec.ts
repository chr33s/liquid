import { Liquid } from '../../../src/liquid'
import { LayoutTag } from '../../../src/tags'

/** `layout` belongs to the hosted dialect; these tests register it on a core engine. */
function withLayout(options?: ConstructorParameters<typeof Liquid>[0]) {
  const engine = new Liquid(options)
  engine.registerTag('layout', LayoutTag)
  return engine
}
import { mock, restore } from '../../stub/mockfs'

describe('tags/layout', function () {
  let liquid: Liquid
  beforeEach(function () {
    liquid = withLayout({
      root: '/',
      extname: '.html'
    })
  })
  afterEach(restore)

  it('should throw when filename not specified', async function () {
    mock({
      '/parent.html': '{%layout%}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('TokenizationError')
      expect(e.message).toMatch(/illegal file path/)
    })
  })
  it('should throw when filename resolved to falsy', async function () {
    mock({
      '/parent.html': '{%layout foo%}'
    })
    return liquid.renderFile('/parent.html').catch(function (e) {
      expect(e.name).toBe('RenderError')
      expect(e.message).toContain('illegal file path')
    })
  })
  it('should handle layout none', async function () {
    const src = '{% layout none %}AB'
    const html = await liquid.parseAndRender(src)
    return expect(html).toBe('AB')
  })
  it('should insert the page body at content_for_layout', async function () {
    mock({
      '/parent.html': 'X{{ content_for_layout }}Y'
    })
    const src = '{% layout "parent.html" %}A'
    const html = await liquid.parseAndRender(src)
    return expect(html).toBe('XAY')
  })
  it('should insert the page body once', async function () {
    mock({
      '/parent.html': 'X{{ content_for_layout }}Y{{ content_for_layout }}Z'
    })
    const html = await liquid.parseAndRender('{% layout "parent.html" %}A')
    return expect(html).toBe('XAYAZ')
  })
  it('should support `options.layouts`', async () => {
    mock({
      '/layouts/parent.html': 'X{{ content_for_layout }}Y'
    })
    const src = '{% layout "parent.html" %}A'
    const liquid = withLayout({ layouts: '/layouts' })
    const html = await liquid.parseAndRender(src)
    return expect(html).toBe('XAY')
  })
  it('should use `layouts` if specified', async function () {
    mock({
      '/layouts/parent.html': 'LAYOUTS {{ content_for_layout }}',
      '/root/parent.html': 'ROOT {{ content_for_layout }}',
      '/root/main.html': '{% layout "parent.html" %}A'
    })
    const engine = withLayout({ root: '/root', layouts: '/layouts' })
    const html = await engine.renderFile('main.html')
    return expect(html).toBe('LAYOUTS A')
  })
  it('should support variable as layout name', async function () {
    mock({
      '/parent.html': 'X{{ content_for_layout }}Y'
    })
    const src = '{% layout parent %}A'
    const html = await liquid.parseAndRender(src, { parent: 'parent.html' })
    return expect(html).toBe('XAY')
  })
  it('should handle a layout that itself has a layout', async function () {
    mock({
      '/grand.html': 'X{{ content_for_layout }}Y',
      '/parent.html': '{%layout "grand" %}P{{ content_for_layout }}',
      '/main.html': '{%layout "parent"%}A'
    })
    const html = await liquid.renderFile('/main.html')
    return expect(html).toBe('XPAY')
  })
  it('should not bleed scope into `include` layout', async function () {
    mock({
      '/parent.html': 'X{{ content_for_layout }}Z',
      '/main.html': '{%layout "parent"%}A{%include "included"%}J',
      '/included.html': '{%layout "parent"%}a'
    })
    const html = await liquid.renderFile('main')
    return expect(html).toBe('XAXaZJZ')
  })
  it('should not bleed scope into `render` layout', async function () {
    mock({
      '/parent.html': 'X{{ content_for_layout }}Z',
      '/main.html': '{%layout "parent"%}A{%render "included"%}J',
      '/included.html': '{%layout "parent"%}a'
    })
    const html = await liquid.renderFile('main')
    return expect(html).toBe('XAXaZJZ')
  })
  it('should support hash list', async function () {
    mock({
      '/parent.html': '{{color}}{{ content_for_layout }}',
      '/main.html': '{% layout "parent.html" color:"black"%}A'
    })
    const html = await liquid.renderFile('/main.html')
    return expect(html).toBe('blackA')
  })
  it('should support multiple hash', async function () {
    mock({
      '/parent.html': '{{color}}{{bg}}{{ content_for_layout }}',
      '/main.html': '{% layout "parent.html" color:"black", bg:"red"%}A'
    })
    const html = await liquid.renderFile('/main.html')
    return expect(html).toBe('blackredA')
  })

  it('should support relative reference', async function () {
    mock({
      '/foo/bar/parent.html': '{{color}}{{ content_for_layout }}',
      '/foo/bar/main.html': '{% layout "./parent.html" color:"black"%}A'
    })
    const engine = withLayout({ root: '/' })
    const html = await engine.renderFile('/foo/bar/main.html')
    return expect(html).toBe('blackA')
  })

  it('should support relative root', async function () {
    mock({
      [process.cwd() + '/foo/parent.html']: '{{color}}{{ content_for_layout }}',
      [process.cwd() + '/foo/bar/main.html']: '{% layout "parent.html" color:"black"%}A'
    })
    const engine = withLayout({ root: './foo' })
    const html = await engine.renderFile('bar/main.html')
    return expect(html).toBe('blackA')
  })

  it('should support subpaths', async function () {
    mock({
      '/foo/parent.html': '{{color}}{{ content_for_layout }}',
      '/main.html': '{% layout "foo/parent.html" color:"black"%}A'
    })
    const engine = withLayout({ root: '/' })
    const html = await engine.renderFile('/main.html')
    return expect(html).toBe('blackA')
  })

  it('should support sync', async function () {
    mock({
      '/grand.html': 'X{{ content_for_layout }}Y',
      '/parent.html': '{%layout "grand" %}P{{ content_for_layout }}',
      '/main.html': '{%layout "parent"%}A'
    })
    const html = await liquid.renderFile('/main.html')
    return expect(html).toBe('XPAY')
  })
})
