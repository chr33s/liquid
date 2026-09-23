import { Liquid, Context, Tag, Emitter, toPromise } from '../../../src'
import { getEventListeners } from 'node:events'
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
  it('does not retain layout blocks when reusing a context', async () => {
    const engine = new Liquid({ templates: { base: '<main>{% block %}default{% endblock %}</main>' } })
    const ctx = new Context({}, engine.options)
    expect(await engine.parseAndRender('{% block %}initial{% endblock %}', ctx)).toBe('initial')
    expect(await engine.parseAndRender('{% layout "base" %}first', ctx)).toBe('<main>first</main>')
    expect(await engine.parseAndRender('{% layout "base" %}second', ctx)).toBe('<main>second</main>')
  })

  it('restores layout mode after a failed body', async () => {
    const engine = new Liquid({ strictVariables: true, templates: { base: '{% block %}{% endblock %}' } })
    const ctx = new Context({}, engine.options)
    await expect(engine.parseAndRender('{% layout "base" %}{{ missing }}', ctx)).rejects.toThrow('undefined variable')
    expect(await engine.parseAndRender('{% block %}recovered{% endblock %}', ctx)).toBe('recovered')
  })

  it.each(['where_exp', 'reject_exp', 'group_by_exp', 'find_exp', 'find_index_exp', 'has_exp'])(
    'restores the expression scope after %s fails',
    async filter => {
      const engine = new Liquid()
      const ctx = new Context({ item: 'outer', items: ['inner'] }, engine.options)
      engine.registerFilter('fail', () => {
        throw new Error('expression failed')
      })
      await expect(engine.parseAndRender(`{{ items | ${filter}: "item", "item | fail" }}`, ctx)).rejects.toThrow(
        'expression failed'
      )
      expect(await engine.parseAndRender('{{ item }}', ctx)).toBe('outer')
    }
  )

  it('keeps rendering after toPromise joins the context operation', async () => {
    const engine = new Liquid()
    engine.registerFilter('lookup', function* (): Generator<unknown, unknown, unknown> {
      return yield toPromise(this.context._get(['name']), this.context.operationOptions)
    })
    await expect(engine.parseAndRender('{{ 1 | lookup }} {{ name }}', { name: 'Ada' })).resolves.toBe('Ada Ada')
  })

  it.each(['get', 'getFromScope'] as const)('keeps overlapping standalone %s calls alive', async method => {
    const a = deferred<string>()
    const b = deferred<string>()
    const scope = { a: a.promise, b: b.promise }
    const ctx = new Context(scope)
    const lookup = (key: string) => (method === 'get' ? ctx.get([key]) : ctx.getFromScope(scope, [key]))
    const first = lookup('a')
    const second = lookup('b')
    a.resolve('first')
    await expect(first).resolves.toBe('first')
    b.resolve('second')
    await expect(second).resolves.toBe('second')
    await expect(ctx.get(['a'])).resolves.toBe('first')
  })

  it.each(['evalValue', 'toPromise'])('cancels nested %s and waits for its finalizer', async method => {
    const engine = new Liquid()
    const ctx = new Context({ name: 'Ada' })
    const controller = new AbortController()
    const entered = deferred<void>()
    const pending = deferred<void>()
    const cleanup = deferred<void>()
    const cleaning = deferred<void>()
    const events: string[] = []
    engine.registerFilter('nested', function () {
      return method === 'evalValue'
        ? engine.evalValue('1 | wait', this.context)
        : toPromise(
            engine._evalValue('1 | wait', this.context, this.context.operationOptions),
            this.context.operationOptions
          )
    })
    engine.registerFilter('wait', function* () {
      try {
        entered.resolve()
        yield pending.promise
        events.push('continued')
      } finally {
        cleaning.resolve()
        yield cleanup.promise
        events.push('cleaned')
      }
    })
    const rendering = engine.parseAndRender('{{ 1 | nested }}', ctx, { signal: controller.signal })
    let settled = false
    const result = rendering.catch(error => {
      settled = true
      return error
    })
    await entered.promise
    controller.abort('stop')
    await cleaning.promise
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    cleanup.resolve()
    await expect(result).resolves.toBe('stop')
    pending.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(events).toEqual(['cleaned'])
    await expect(ctx.get(['name'])).resolves.toBe('Ada')
  })

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

  it('forwards the driving signal to direct generator renders and releases listeners', async () => {
    const engine = new Liquid()
    const controller = new AbortController()
    let aborted: boolean | undefined
    engine.registerFilter('abort', function () {
      controller.abort('stop')
      aborted = this.context.signal.aborted
    })
    await toPromise(engine._render(engine.parse('{{ 1 }}'), {}, { signal: controller.signal }))
    await toPromise(engine._evalValue('1', {}, { signal: controller.signal }))
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    const rendering = toPromise(engine._render(engine.parse('{{ 1 | abort }}'), {}), { signal: controller.signal })
    await expect(rendering).rejects.toBe('stop')
    expect(aborted).toBe(true)
  })

  it('keeps a retained or overlapped context usable', async () => {
    const engine = new Liquid()
    let retained: Context | undefined
    engine.registerFilter('retain', function () {
      retained = this.context
    })
    engine.registerFilter('delay', (value, ms) => new Promise(resolve => setTimeout(() => resolve(value), ms)))
    await engine.parseAndRender('{{ 1 | retain }}', { x: 'X' })
    await expect(retained!.get(['x'])).resolves.toBe('X')
    await expect(engine.parseAndRender('{{ x }}', retained)).resolves.toBe('X')
    const ctx = new Context({ a: 'A' }, engine.options)
    const rendering = engine.parseAndRender('{{ a | delay: 5 }}', ctx)
    const streaming = drainStream(engine.renderToStream(engine.parse('{{ a | delay: 20 }}'), ctx))
    await expect(Promise.all([rendering, streaming])).resolves.toEqual(['A', 'A'])
    await expect(ctx.get(['a'])).resolves.toBe('A')
  })

  it('drains joined lookups before finishing a stream', async () => {
    const engine = new Liquid()
    let lookup: Promise<unknown> | undefined
    engine.registerFilter('background', function () {
      lookup = this.context.get(['slow'])
      return 'x'
    })
    const scope = { slow: () => new Promise(resolve => setTimeout(() => resolve('done'), 5)) }
    await expect(drainStream(engine.renderToStream(engine.parse('{{ 1 | background }}'), scope))).resolves.toBe('x')
    await expect(lookup).resolves.toBe('done')
  })

  it('restores a caller context after cancellation', async () => {
    const engine = new Liquid()
    const ctx = new Context({ name: 'Ada' })
    await engine.parseAndRender('{{ name }}', ctx)
    await expect(ctx.get(['name'])).resolves.toBe('Ada')
  })
})

describe('Web text streams', () => {
  it('matches buffered layouts, captures and partials', async () => {
    const engine = new Liquid({
      templates: {
        theme: '<main>{% block %}{% endblock %}</main>',
        part: '{{ value }}'
      }
    })
    const templates = engine.parse(
      '{% layout "theme" %}{% capture x %}hi{% endcapture %}{{ x }}{% render "part", value: "🌍" %}'
    )
    expect(await drainStream(engine.renderToStream(templates))).toBe(await engine.render(templates))
  })

  it('streams inherited blocks and block.super through the same sink', async () => {
    const engine = new Liquid({ templates: { base: '<main>{% block body %}parent{% endblock %}</main>' } })
    const templates = engine.parse('{% layout "base" %}{% block body %}{{ block.super }}{{ text }}{% endblock %}')
    const scope = { text: '🌍'.repeat(40_000) }
    const expected = '<main>parent' + scope.text + '</main>'
    expect(await engine.render(templates, scope)).toBe(expected)
    expect(await drainStream(engine.renderToStream(templates, scope))).toBe(expected)
  })

  it.each([
    '{% for item in (1..2) %}{{ 1 | wait }}{% endfor %}',
    '{% tablerow item in (1..2) %}{{ 1 | wait }}{% endtablerow %}',
    '{% include "part" item: "inner" %}',
    '{% layout "base" %}{% block body %}{{ 1 | wait }}{% endblock %}'
  ])('unwinds restored tag scopes on cancellation: %s', async template => {
    const engine = new Liquid({
      templates: { part: '{{ 1 | wait }}', base: '{% block body %}parent{% endblock %}' }
    })
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
  it.each([false, true])('releases analysis abort listeners after completion (failure: %s)', async fail => {
    const engine = new Liquid({ templates: { part: '{{ value }}' } })
    const controller = new AbortController()
    const analysis = engine.parseAndAnalyze(`{% render "${fail ? 'missing' : 'part'}" %}`, undefined, {
      signal: controller.signal
    })
    if (fail) await expect(analysis).rejects.toThrow('Failed to lookup')
    else await expect(analysis).resolves.toHaveProperty('globals.value')
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

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
