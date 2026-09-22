import { LayoutTag } from '../../../src/tags'
import { Liquid, Context, Tag, Emitter, toPromise } from '../../../src'
import { drainStream } from '../../stub/stream'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('operation lifecycle', () => {
  it('rejects pre-aborted combined calls before parsing', async () => {
    const engine = new Liquid()
    const reason = { cancelled: true }
    const signal = AbortSignal.abort(reason)
    await expect(engine.parseAndRender('{{', {}, { signal })).rejects.toBe(reason)
    await expect(engine.parseAndAnalyze('{{', undefined, { signal })).rejects.toBe(reason)
    await expect(engine.variables('{{', { signal })).rejects.toBe(reason)
    await expect(drainStream(engine.renderToStream([], {}, { signal }))).rejects.toBe(reason)
  })

  it('unwinds inner and outer finalizers without entering ordinary catches', async () => {
    const controller = new AbortController()
    const events: string[] = []
    const started = deferred<void>()
    function* inner() {
      try {
        started.resolve()
        yield new Promise(() => {})
      } catch {
        events.push('catch')
      } finally {
        yield Promise.resolve()
        events.push('inner')
      }
    }
    function* outer() {
      try {
        yield inner()
        events.push('continued')
      } finally {
        yield Promise.resolve()
        events.push('outer')
      }
    }
    const result = toPromise(outer(), { signal: controller.signal })
    await started.promise
    controller.abort(17)
    await expect(result).rejects.toBe(17)
    expect(events).toEqual(['inner', 'outer'])
  })

  it('observes late rejection after cancellation', async () => {
    const pending = deferred<string>()
    const controller = new AbortController()
    const engine = new Liquid()
    engine.registerFilter('wait', () => pending.promise)
    const result = engine.parseAndRender('{{ 1 | wait }}', {}, { signal: controller.signal })
    controller.abort('stop')
    await expect(result).rejects.toBe('stop')
    pending.reject(new Error('late'))
    await Promise.resolve()
  })

  it('allows a host task to cancel long in-memory rendering', async () => {
    const controller = new AbortController()
    const engine = new Liquid()
    const result = engine.parseAndRender(
      '{% for i in (1..1000000) %}{{ i }}{% endfor %}',
      {},
      { signal: controller.signal }
    )
    setTimeout(() => controller.abort('timer'), 0)
    await expect(result).rejects.toBe('timer')
  })

  it('preserves nested generator return values and ordinary recovery', async () => {
    function* child() {
      return 'child'
    }
    function* outer() {
      return child()
    }
    expect(await toPromise(outer())).toBe('child')
    function* recover() {
      try {
        yield Promise.reject('failure')
      } catch {
        return 'recovered'
      }
    }
    expect(await toPromise(recover())).toBe('recovered')
  })

  it('isolates shared cached work from aborted waiters and async hooks', async () => {
    const read = deferred<string>()
    const cache = new Map()
    const provider = vi.fn(() => read.promise)
    const engine = new Liquid({
      cache: {
        read: async key => cache.get(key),
        write: async (key, value) => {
          cache.set(key, value)
        },
        remove: async key => {
          cache.delete(key)
        }
      },
      relativeReference: false,
      fs: { resolve: (_root, file) => file, exists: () => true, readFile: provider }
    })
    const controller = new AbortController()
    const first = engine.renderFile('shared', {}, { signal: controller.signal })
    const second = engine.renderFile('shared')
    controller.abort('leave')
    await expect(first).rejects.toBe('leave')
    read.resolve('shared text')
    await expect(second).resolves.toBe('shared text')
    await expect(engine.renderFile('shared')).resolves.toBe('shared text')
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('restores a caller context after cancellation', async () => {
    const engine = new Liquid()
    const ctx = new Context({ name: 'Ada' })
    await engine.parseAndRender('{{ name }}', ctx)
    await expect(ctx.get(['name'])).resolves.toBe('Ada')
  })
})

describe('Web text streams', () => {
  it('streams hosted sections through the default layout under backpressure', async () => {
    const engine = new Liquid({
      profile: 'shopify_theme',
      templates: {
        theme: '<main>{{ content_for_layout }}</main>',
        'sections/hero': '{% style %}{{ text }}{% endstyle %}',
        index: '{% section "hero" %}'
      }
    })
    const scope = { text: 'x'.repeat(200_000) }
    const expected = await engine.renderFile('index', scope)
    expect(await drainStream(await engine.renderFileToStream('index', scope))).toBe(expected)
  })

  it('matches buffered layouts, captures and partials', async () => {
    const engine = new Liquid({
      templates: {
        theme: '<main>{{ content_for_layout }}</main>',
        part: '{{ value }}'
      }
    })
    engine.registerTag('layout', LayoutTag)
    const templates = engine.parse(
      '{% layout "theme" %}{% capture x %}hi{% endcapture %}{{ x }}{% render "part", value: "🌍" %}'
    )
    expect(await drainStream(engine.renderToStream(templates))).toBe(await engine.render(templates))
  })

  it('streams layout content through the same sink', async () => {
    const engine = new Liquid({ templates: { base: '<main>parent{{ content_for_layout }}</main>' } })
    engine.registerTag('layout', LayoutTag)
    const templates = engine.parse('{% layout "base" %}{{ text }}')
    const scope = { text: '🌍'.repeat(40_000) }
    const expected = '<main>parent' + scope.text + '</main>'
    expect(await engine.render(templates, scope)).toBe(expected)
    expect(await drainStream(engine.renderToStream(templates, scope))).toBe(expected)
  })

  it.each([
    '{% for item in (1..2) %}{{ 1 | wait }}{% endfor %}',
    '{% tablerow item in (1..2) %}{{ 1 | wait }}{% endtablerow %}',
    '{% include "part" item: "inner" %}',
    '{% layout "base" %}{{ 1 | wait }}'
  ])('unwinds restored tag scopes on cancellation: %s', async template => {
    const engine = new Liquid({
      templates: { part: '{{ 1 | wait }}', base: '{{ content_for_layout }}' }
    })
    engine.registerTag('layout', LayoutTag)
    const ctx = new Context({ item: 'outer', block: 'outer' }, engine.options)
    const entered = deferred<void>()
    engine.registerFilter('wait', () => {
      entered.resolve()
      return new Promise(() => {})
    })
    const controller = new AbortController()
    const rendering = engine.parseAndRender(template, ctx, { signal: controller.signal })
    await entered.promise
    controller.abort('stop')
    await expect(rendering).rejects.toBe('stop')
    expect(await engine.parseAndRender('{{ item }}|{{ block }}', ctx)).toBe('outer|outer')
  })

  it('bounds prefetch and cancels while backpressured', async () => {
    const engine = new Liquid()
    const reached = vi.fn(() => 'tail')
    engine.registerFilter('reached', reached)
    const stream = engine.renderToStream(engine.parse('x'.repeat(200_000) + '{{ 1 | reached }}'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(reached).not.toHaveBeenCalled()
    await stream.cancel('unused')
    expect(reached).not.toHaveBeenCalled()
  })

  it('preserves split surrogate pairs when encoded', async () => {
    const engine = new Liquid()
    const text = 'x'.repeat(16_383) + '🌍'
    const stream = engine.renderToStream(engine.parse(text)).pipeThrough(new TextEncoderStream())
    expect(await new Response(stream).text()).toBe(text)
  })

  it('rejects overlapping extension writes without unhandled rejection', async () => {
    const engine = new Liquid()
    engine.registerTag(
      'bad',
      class extends Tag {
        render(_ctx: Context, emitter: Emitter) {
          emitter.write('x'.repeat(200_000))
          emitter.write('second')
        }
      }
    )
    await expect(drainStream(engine.renderToStream(engine.parse('{% bad %}')))).rejects.toThrow('Overlapping')
  })

  it('errors immediately on abort but waits for finalizer cleanup on cancel', async () => {
    const cleanup = deferred<void>()
    const started = deferred<void>()
    const engine = new Liquid()
    engine.registerTag(
      'wait',
      class extends Tag {
        *render() {
          try {
            started.resolve()
            yield new Promise(() => {})
          } finally {
            yield cleanup.promise
          }
        }
      }
    )
    const stream = engine.renderToStream(engine.parse('{% wait %}'))
    await started.promise
    let settled = false
    const cancellation = stream.cancel().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    cleanup.resolve()
    await cancellation
    expect(settled).toBe(true)
  })
})

describe('operation boundary races', () => {
  it('preserves cross-realm reasons and bypasses aggregate errors', async () => {
    const { runInNewContext } = await import('node:vm')
    const reason = runInNewContext('({ cancelled: true })')
    const engine = new Liquid({ catchAllErrors: true })
    const controller = new AbortController()
    engine.registerFilter('abort', () => {
      controller.abort(reason)
      throw new Error('host wrapper')
    })
    await expect(engine.parseAndRender('{{ 1 | abort }}', {}, { signal: controller.signal })).rejects.toBe(reason)
  })

  it('treats a provider AbortError as an ordinary failure', async () => {
    const engine = new Liquid()
    engine.registerFilter('fail', () => {
      throw Object.assign(new Error('provider'), { name: 'AbortError' })
    })
    await expect(engine.parseAndRender('{{ 1 | fail }}')).rejects.toMatchObject({ name: 'RenderError' })
  })

  it('cancels a native async context lookup using the render owner', async () => {
    const engine = new Liquid()
    const controller = new AbortController()
    const entered = deferred<void>()
    engine.registerFilter('lookup', async function () {
      entered.resolve()
      return this.context.get(['value'])
    })
    const rendering = engine.parseAndRender(
      '{{ 1 | lookup }}',
      { value: () => new Promise(() => {}) },
      { signal: controller.signal }
    )
    await entered.promise
    controller.abort('lookup cancelled')
    await expect(rendering).rejects.toBe('lookup cancelled')
  })

  it('propagates options to analysis child hooks and cancels traversal', async () => {
    const engine = new Liquid()
    let received: AbortSignal | undefined
    const entered = deferred<void>()
    const template = {
      *render() {},
      *children(_partials: boolean, options?: { signal?: AbortSignal }) {
        received = options?.signal
        entered.resolve()
        yield new Promise(() => {})
        return []
      }
    } as any
    const controller = new AbortController()
    const result = engine.analyze([template], { signal: controller.signal })
    await entered.promise
    controller.abort('analysis cancelled')
    await expect(result).rejects.toBe('analysis cancelled')
    expect(received?.aborted).toBe(true)
  })

  it('restores loop setup scope when a yielded hash fails', async () => {
    const engine = new Liquid()
    const ctx = new Context({ size: () => Promise.reject(new Error('size failure')) })
    await expect(engine.parseAndRender('{% for x in (1..2) limit:size %}{{x}}{% endfor %}', ctx)).rejects.toThrow(
      'size failure'
    )
    expect(ctx.getAll()).not.toHaveProperty('continue')
  })

  it('does not let secondary cleanup failure replace cancellation', async () => {
    const controller = new AbortController()
    const entered = deferred<void>()
    const events: string[] = []
    function* inner() {
      try {
        entered.resolve()
        yield new Promise(() => {})
      } finally {
        yield Promise.reject(new Error('cleanup'))
      }
    }
    function* outer() {
      try {
        yield* inner()
      } finally {
        events.push('outer')
      }
    }
    const result = toPromise(outer(), { signal: controller.signal })
    await entered.promise
    controller.abort('primary')
    await expect(result).rejects.toBe('primary')
    expect(events).toEqual(['outer'])
  })

  it('propagates downstream byte cancellation to producer cleanup', async () => {
    const engine = new Liquid()
    const entered = deferred<void>()
    const cleanup = deferred<void>()
    let cleaned = false
    engine.registerTag(
      'wait',
      class extends Tag {
        *render() {
          try {
            entered.resolve()
            yield new Promise(() => {})
          } finally {
            cleaned = true
            cleanup.resolve()
          }
        }
      }
    )
    const bytes = engine.renderToStream(engine.parse('{% wait %}')).pipeThrough(new TextEncoderStream())
    await entered.promise
    await bytes.cancel('destination closed')
    await cleanup.promise
    expect(cleaned).toBe(true)
  })
})
