import { LayoutTag } from '../../../src/tags'
import { Liquid } from '../../../src'
import { createFS } from '../../../src/build/fs-impl-browser'

const fs = (readFile: (file: string, options?: any) => any) => ({
  resolve: (root: string, file: string) => `${root}/${file}`,
  exists: () => true,
  readFile
})

describe('classified loading and source limits', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves in-memory templates with explicit extensions and relative references', async () => {
    const engine = new Liquid({
      extname: '.liquid',
      templates: {
        'page.liquid': '{% render "./part.liquid" %}',
        'part.liquid': 'part'
      }
    })
    await expect(engine.renderFile('page.liquid')).resolves.toBe('part')
    await expect(engine.renderFile('./page')).resolves.toBe('part')
  })

  it.each(['render', 'include', 'layout'])('preserves the absolute root for relative %s references', async tag => {
    const page = `{% ${tag} "./part" %}`
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: { '/page': page, '/part': 'absolute', page, part: 'relative' }
    })
    await expect(engine.renderFile('/page')).resolves.toBe('absolute')
    await expect(engine.renderFile('page')).resolves.toBe('relative')
  })

  it('tries the next optimistic candidate only for absence', async () => {
    const read = vi.fn((file: string) => {
      if (file === 'first/page') throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      return 'found'
    })
    const engine = new Liquid({ root: ['first', 'second'], relativeReference: false, fs: fs(read) })
    expect(await engine.renderFile('page')).toBe('found')
    expect(read).toHaveBeenCalledTimes(2)
    read.mockImplementation(() => {
      throw new Error('permission denied')
    })
    await expect(engine.renderFile('page')).rejects.toThrow('permission denied')
    expect(read).toHaveBeenCalledTimes(3)
  })

  it.each([-1, 1.5, NaN, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid source byte limit %s', limit => {
    expect(() => new Liquid({ sourceByteLimit: limit })).toThrow('sourceByteLimit')
  })

  it('checks custom decoded sources against the parser allowance', async () => {
    const engine = new Liquid({ parseLimit: 3, relativeReference: false, fs: fs(() => 'four') })
    await expect(engine.renderFile('page')).rejects.toThrow('parse length limit exceeded')
  })

  it('enforces UTF-8 map size and preserves empty templates', async () => {
    const engine = new Liquid({ sourceByteLimit: 3, templates: { page: '🌍', empty: '' } })
    await expect(engine.renderFile('page')).rejects.toThrow('source byte limit exceeded')
    await expect(engine.renderFile('empty')).resolves.toBe('')
  })

  it('bounds Fetch reading and cancels on overflow', async () => {
    const cancel = vi.fn()
    const pull = vi.fn(controller => controller.enqueue(new Uint8Array(4)))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new ReadableStream({ pull, cancel })))
    )
    await expect(
      createFS('https://example.com/').readFile('https://example.com/page', { sourceByteLimit: 5 })
    ).rejects.toThrow('source byte limit exceeded')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(pull.mock.calls.length).toBeLessThan(5)
  })

  it('decodes split UTF-8 and strips the initial BOM once', async () => {
    const bytes = new TextEncoder().encode('\uFEFF🌍\uFEFF')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
                controller.close()
              }
            }),
            { headers: { 'content-type': 'text/plain;charset=iso-8859-1' } }
          )
      )
    )
    await expect(createFS().readFile('https://example.com/page', { sourceByteLimit: 20 })).resolves.toBe('🌍\uFEFF')
  })

  it.each([401, 403, 410, 500])('rejects HTTP %s without reading its body', async status => {
    const cancel = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new ReadableStream({ cancel }), { status }))
    )
    await expect(createFS().readFile('https://user:secret@example.com/page?token=private')).rejects.toMatchObject({
      status,
      message: `Template request failed with HTTP ${status}`
    })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('uses an explicit base without inspecting the DOM', () => {
    vi.stubGlobal(
      'document',
      new Proxy(
        {},
        {
          get() {
            throw new Error('DOM access')
          }
        }
      )
    )
    const adapter = createFS('https://example.com/root/')
    expect(adapter.resolve('views', 'page?x=1#fragment', '.liquid')).toBe(
      'https://example.com/root/views/page.liquid?x=1#fragment'
    )
    expect(adapter.dirname!('https://example.com/root/page?x=1#f')).toBe('https://example.com/root/')
  })

  it('snapshots each engine base and supports absolute references without a document', () => {
    const document = { baseURI: 'https://example.com/one/' }
    vi.stubGlobal('document', document)
    const first = createFS()
    document.baseURI = 'https://example.com/two/'
    const second = createFS()
    expect(first.resolve('.', 'page', '')).toBe('https://example.com/one/page')
    expect(second.resolve('.', 'page', '')).toBe('https://example.com/two/page')
    vi.stubGlobal('document', undefined)
    expect(createFS().resolve('https://example.com/', 'page', '')).toBe('https://example.com/page')
  })

  it('does not disguise operational layout failures', async () => {
    const engine = new Liquid({
      relativeReference: false,
      fs: fs(() => {
        throw new Error('offline')
      })
    })
    engine.registerTag('layout', LayoutTag)
    await expect(engine.parseAndRender('{% layout "theme" %}body')).rejects.toThrow('offline')
  })

  it('does not disguise operational default theme layout failures', async () => {
    const engine = new Liquid({
      profile: 'shopify_theme',
      relativeReference: false,
      fs: fs(() => {
        throw new Error('offline')
      })
    })
    await expect(engine.parseAndRender('body')).rejects.toThrow('offline')
  })

  it('keeps primary load failure when async cache eviction also fails', async () => {
    const primary = new Error('load failed')
    const engine = new Liquid({
      relativeReference: false,
      fs: fs(() => {
        throw primary
      }),
      cache: {
        read: async () => undefined,
        write: async () => {},
        remove: async () => {
          throw new Error('eviction failed')
        }
      }
    })
    await expect(engine.parseFile('page')).rejects.toBe(primary)
    await expect(engine.parseFile('page')).rejects.toBe(primary)
  })
})

it('rejects a Sync-only provider at construction without calling it', () => {
  const readFileSync = vi.fn()
  expect(() => new Liquid({ fs: { readFileSync, existsSync: () => true, resolve: () => '' } as any })).toThrow(
    'fs requires'
  )
  expect(readFileSync).not.toHaveBeenCalled()
})

it('unwinds an in-flight load when cache publication fails and observes its late rejection', async () => {
  const publication = new Error('publication failed')
  let rejectRead!: (reason: unknown) => void
  let signal: AbortSignal | undefined
  const engine = new Liquid({
    relativeReference: false,
    fs: fs((_file, options) => {
      signal = options.signal
      return new Promise((_resolve, reject) => {
        rejectRead = reject
      })
    }),
    cache: {
      read: () => undefined,
      write: async () => {
        throw publication
      },
      remove: async () => {}
    }
  })
  await expect(engine.parseFile('page')).rejects.toBe(publication)
  expect(signal?.aborted).toBe(true)
  rejectRead(new Error('late source error'))
  await Promise.resolve()
})
