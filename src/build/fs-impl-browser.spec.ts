import * as fs from './fs-impl-browser'
import { JSDOM } from 'jsdom'
describe('fs/browser', function () {
  beforeEach(function () {
    const dom = new JSDOM(``, {
      url: 'https://example.com/foo/bar/',
      contentType: 'text/html',
      includeNodeLocations: true
    })
    ;(global as any).document = dom.window.document
  })
  afterEach(function () {
    delete (global as any).document
  })
  describe('#resolve()', function () {
    it('should support relative root', function () {
      expect(fs.createFS().resolve('./views/', 'foo', '')).toBe('https://example.com/foo/bar/views/foo')
    })
    it('should treat root as directory', function () {
      expect(fs.createFS().resolve('./views', 'foo', '')).toBe('https://example.com/foo/bar/views/foo')
    })
    it('should support absolute root', function () {
      expect(fs.createFS().resolve('/views', 'foo', '')).toBe('https://example.com/views/foo')
    })
    it('should support empty root', function () {
      expect(fs.createFS().resolve('', 'page.html', '')).toBe('https://example.com/foo/bar/page.html')
    })
    it('should support full url as root', function () {
      expect(fs.createFS().resolve('https://example.com/views/', 'page.html', '')).toBe(
        'https://example.com/views/page.html'
      )
    })
    it('should add extname when absent', function () {
      expect(fs.createFS().resolve('https://example.com/views/', 'page', '.html')).toBe(
        'https://example.com/views/page.html'
      )
    })
    it('should add extname for urls have searchParams', function () {
      expect(fs.createFS().resolve('https://example.com/views/', 'page?foo=bar', '.html')).toBe(
        'https://example.com/views/page.html?foo=bar'
      )
    })
    it('should not add extname when full url is given', function () {
      expect(fs.createFS().resolve('https://example.com/views/', 'https://google.com/page.php', '.html')).toBe(
        'https://google.com/page.php'
      )
    })
    it('should not add extname when already have one', function () {
      expect(fs.createFS().resolve('https://example.com/views/', 'page.php', '.html')).toBe(
        'https://example.com/views/page.php'
      )
    })
  })
  describe('#dirname()', () => {
    it('should return dirname of file', async function () {
      const val = fs.createFS().dirname!('https://example.com/views/foo/bar')
      expect(val).toBe('https://example.com/views/foo/')
    })
  })
  describe('#exists()', () => {
    it('should always return true', async function () {
      const val = await fs.createFS().exists('/foo/bar')
      expect(val).toBe(true)
    })
  })
  describe('#exists()', () => {
    it('should always return true', async function () {
      expect(await fs.createFS().exists('/foo/bar')).toBe(true)
    })
  })
  describe('#readFile()', () => {
    afterEach(() => vi.unstubAllGlobals())
    it('reads UTF-8 template text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('hello {{name}}')))
      expect(await fs.readFile('https://example.com/hello')).toBe('hello {{name}}')
    })
    it('classifies 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
      await expect(fs.readFile('https://example.com/missing')).rejects.toHaveProperty('code', 'ENOENT')
    })
    it('preserves network failures', async () => {
      const error = new TypeError('Network error')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
      await expect(fs.readFile('https://example.com/hello')).rejects.toBe(error)
    })
  })
})
