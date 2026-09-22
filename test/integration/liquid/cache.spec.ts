import { Liquid } from '../../../src/liquid'
import { mock, restore } from '../../stub/mockfs'
import { Template } from '../../../src/template'
describe('LiquidOptions#cache', function () {
  it.each([false, true])('forwards tenant identity to file providers with cache=%s', async function (cache) {
    const reads: Array<string | undefined> = []
    const engine = new Liquid({
      cache,
      relativeReference: false,
      fs: {
        resolve: (_root, file) => file,
        exists: () => true,
        readFile: (_file, options?: { signal?: AbortSignal; tenant?: string }) => {
          reads.push(options?.tenant)
          return options?.tenant ?? 'missing'
        }
      }
    })
    const render = (tenant: string) => engine.renderFile('shared', {}, { theme: { tenant } })
    expect(await Promise.all([render('a'), render('b')])).toEqual(['a', 'b'])
    expect(await render('a')).toBe('a')
    expect(reads).toEqual(cache ? ['a', 'b'] : ['a', 'b', 'a'])
  })

  afterEach(restore)
  describe('#renderFile', function () {
    it('should be disabled by default', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html'
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('bar')
    })
    it('should be disabled when cache <= 0', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: -1
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('bar')
    })
    it('should respect cache=true option', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/files/foo.html': 'foo' })
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      mock({ '/root/files/foo.html': 'bar' })
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('foo')
    })
    it('should respect cache=2 option', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: 2
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      await engine.renderFile('files/foo')
      mock({ '/root/files/foo.html': 'FOO' })
      await engine.renderFile('files/bar')
      const x = await engine.renderFile('files/foo')
      expect(x).toBe('foo')
      await engine.renderFile('files/bar')
      await engine.renderFile('files/coo')
      const y = await engine.renderFile('files/foo')
      expect(y).toBe('FOO')
    })
    it('should respect cache={read, write} option', async function () {
      let last: Template[] | undefined
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: {
          remove: () => void 0,
          read: (): Template[] | undefined => last,
          write: (key: string, value: Template[]) => {
            last = value
          }
        }
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      expect(await engine.renderFile('files/foo')).toBe('foo')
      expect(await engine.renderFile('files/bar')).toBe('foo')
      expect(await engine.renderFile('files/coo')).toBe('foo')
    })
    it('should respect cache={ async read, async write } option', async function () {
      const cached: {
        [key: string]: Template[] | undefined
      } = {}
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: {
          remove: (key: string) => {
            delete cached[key]
          },
          read: (key: string) => Promise.resolve(cached[key]),
          write: (key: string, value: Template[]) => {
            cached[key] = value
            return Promise.resolve()
          }
        }
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      expect(await engine.renderFile('files/foo')).toBe('foo')
      expect(await engine.renderFile('files/bar')).toBe('bar')
      expect(await engine.renderFile('files/coo')).toBe('coo')
      mock({ '/root/files/coo.html': 'COO' })
      expect(await engine.renderFile('files/coo')).toBe('coo')
    })
    it('should handle concurrent cache read/write', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: 1
      })
      mock({ '/root/files/foo.html': 'foo' })
      mock({ '/root/files/bar.html': 'bar' })
      mock({ '/root/files/coo.html': 'coo' })
      const [foo1, foo2, bar, coo] = await Promise.all([
        engine.renderFile('files/foo'),
        engine.renderFile('files/foo'),
        engine.renderFile('files/bar'),
        engine.renderFile('files/coo')
      ])
      expect(foo1).toBe('foo')
      expect(foo2).toBe('foo')
      expect(bar).toBe('bar')
      expect(coo).toBe('coo')
    })
    it('should not cache not exist file', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      try {
        await engine.renderFile('foo')
      } catch (err) {}
      mock({ '/root/foo.html': 'foo' })
      const html = await engine.renderFile('foo')
      expect(html).toBe('foo')
    })
  })
  describe('#renderFile', function () {
    it('should be disabled by default', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html'
      })
      mock({ '/root/foo.html': 'foo' })
      const x = await engine.renderFile('foo')
      expect(x).toBe('foo')
      mock({ '/root/foo.html': 'bar' })
      const y = await engine.renderFile('foo')
      expect(y).toBe('bar')
    })
    it('should respect cache=true option', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({ '/root/foo.html': 'foo' })
      expect(await engine.renderFile('foo')).toBe('foo')
      mock({ '/root/foo.html': 'bar' })
      expect(await engine.renderFile('foo')).toBe('foo')
    })
    it('should not cache not exist file', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      try {
        await engine.renderFile('foo')
      } catch (err) {}
      mock({ '/root/foo.html': 'foo' })
      const y = await engine.renderFile('foo')
      expect(y).toBe('foo')
    })
    it('should cache relative referenced files properly', async function () {
      const engine = new Liquid({
        root: '/root/',
        extname: '.html',
        cache: true
      })
      mock({
        '/root/foo.html': '{% render "./bar" %}',
        '/root/bar.html': 'bar1',
        '/root/another/foo.html': '{% render "./bar" %}',
        '/root/another/bar.html': 'bar2'
      })
      const foo1 = await engine.renderFile('foo')
      expect(foo1).toBe('bar1')
      const foo2 = await engine.renderFile('another/foo')
      expect(foo2).toBe('bar2')
    })
  })
})
