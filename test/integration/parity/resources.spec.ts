import { Liquid } from '../../../src/liquid'
import { mock, restore } from '../../stub/mockfs'

describe('parity: range and resource safety', function () {
  const liquid = new Liquid()

  it('T27: a huge logical range with a small slice is not materialized', async function () {
    const start = Date.now()
    const html = await liquid.parseAndRender('{% for i in (1..100000000000) limit: 3 %}{{ i }},{% endfor %}')
    expect(html).toBe('1,2,3,')
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('T27: offset into a huge range is bounded', async function () {
    const html = await liquid.parseAndRender('{% for i in (1..100000000000) offset: 99999999996 %}{{ i }},{% endfor %}')
    expect(html).toBe('99999999997,99999999998,99999999999,100000000000,')
  })

  it('T27: contains on a huge range does not materialize', async function () {
    expect(await liquid.parseAndRender('{% if (1..100000000000) contains 5 %}y{% else %}n{% endif %}')).toBe('y')
    expect(await liquid.parseAndRender('{% if (1..100000000000) contains 0 %}y{% else %}n{% endif %}')).toBe('n')
  })

  it('T28: visited empty-body iterations consume the work budget', async function () {
    const limited = new Liquid({ templateLimit: 100 })
    await expect(limited.parseAndRender('{% for i in (1..1000) %}{% endfor %}')).rejects.toThrow(
      'template limit exceeded'
    )
    await expect(limited.parseAndRender('{% for i in (1..10) %}{% endfor %}')).resolves.toBe('')
  })

  it.each(['raise', 'inline'] as const)(
    'stops work after a resource limit even when collecting %s errors',
    async renderErrors => {
      const engine = new Liquid({ templateLimit: 3, catchAllErrors: true, renderErrors })
      const later = vi.fn(() => 'after')
      engine.registerFilter('later', later)
      const result = engine.parseAndRender('{% for i in (1..10) %}x{% endfor %}{{ 1 | later }}')
      if (renderErrors === 'raise') await expect(result).rejects.toThrow('template limit exceeded')
      else await expect(result).resolves.toBe('Liquid error (line 1): Memory limits exceeded: template limit exceeded')
      expect(later).not.toHaveBeenCalled()
    }
  )

  it('T29: reversal and offset preserve length while charging only visited work', async function () {
    expect(await liquid.parseAndRender('{% for i in (1..100000000000) limit: 3 reversed %}{{ i }},{% endfor %}')).toBe(
      '3,2,1,'
    )
    expect(await liquid.parseAndRender('{% for i in (1..8) limit: 3 %}{{ forloop.length }}:{{ i }} {% endfor %}')).toBe(
      '3:1 3:2 3:3 '
    )
  })

  it('T29: break charges only the work visited before it', async function () {
    const limited = new Liquid({ templateLimit: 100 })
    await expect(limited.parseAndRender('{% for i in (1..1000000) %}{{ i }}{% break %}{% endfor %}')).resolves.toBe('1')
  })

  it('T30: budgets accumulate across nested renders', async function () {
    mock({ '/leaf': '{% for i in (1..30) %}{{ i }}{% endfor %}' })
    const limited = new Liquid({ root: '/', templateLimit: 50 })
    await expect(limited.parseAndRender('{% render "leaf" %}{% render "leaf" %}')).rejects.toThrow(
      'template limit exceeded'
    )
    restore()
  })

  it('T30: a fresh render() call starts from a fresh budget', async function () {
    const limited = new Liquid({ templateLimit: 100 })
    await expect(limited.parseAndRender('{% for i in (1..10) %}{{ i }}{% endfor %}')).resolves.toBe('12345678910')
    await expect(limited.parseAndRender('{% for i in (1..10) %}{{ i }}{% endfor %}')).resolves.toBe('12345678910')
  })

  it('T31: capture is charged even when nothing is emitted', async function () {
    const limited = new Liquid({ assignLimit: 20 })
    await expect(
      limited.parseAndRender('{% capture big %}{% for i in (1..30) %}x{% endfor %}{% endcapture %}')
    ).rejects.toThrow('assign limit exceeded')
    await expect(
      limited.parseAndRender('{% capture small %}{% for i in (1..5) %}x{% endfor %}{% endcapture %}')
    ).resolves.toBe('')
  })

  it('T31: assignment is charged even when nothing is emitted', async function () {
    const limited = new Liquid({ assignLimit: 20 })
    await expect(limited.parseAndRender('{% assign a = s %}', { s: 'x'.repeat(30) })).rejects.toThrow(
      'assign limit exceeded'
    )
  })

  it('A01: re-assigning a variable charges the assign score again', async function () {
    const src = '{% assign a = s %}{% assign a = s %}{% assign a = s %}'
    const env = { s: 'x'.repeat(15) }
    await expect(new Liquid({ assignLimit: 20 }).parseAndRender(src, env)).rejects.toThrow('Memory limits exceeded')
    await expect(new Liquid({ assignLimit: 45 }).parseAndRender(src, env)).resolves.toBe('')
    await expect(new Liquid({ assignLimit: 44 }).parseAndRender(src, env)).rejects.toThrow('Memory limits exceeded')
  })

  it('T32: parse depth is guarded independently of render depth', function () {
    const deep = '{% if true %}'.repeat(200) + '{% endif %}'.repeat(200)
    expect(() => new Liquid().parse(deep)).toThrow('parse depth limit exceeded')
    expect(() => new Liquid({ maxParseDepth: 500 }).parse(deep)).not.toThrow()
  })

  it('T32: recursive partials fail deterministically', async function () {
    mock({ '/loop': '{% render "loop" %}' })
    const engine = new Liquid({ root: '/', maxDepth: 10 })
    await expect(engine.parseAndRender('{% render "loop" %}')).rejects.toThrow('Nesting too deep')
    restore()
  })

  it('T33: a failed partial leaves no stale depth or scope state', async function () {
    mock({ '/boom': '{{ missing.a.b }}', '/ok': 'ok' })
    const engine = new Liquid({ root: '/', maxDepth: 2, strictVariables: true })
    await expect(engine.parseAndRender('{% render "boom" %}')).rejects.toThrow()
    await expect(engine.parseAndRender('{% render "ok" %}')).resolves.toBe('ok')
    restore()
  })

  it('T33: a failure inside a loop restores the outer scope', async function () {
    const engine = new Liquid({ strictVariables: true })
    await expect(engine.parseAndRender('{% for i in (1..3) %}{{ missing }}{% endfor %}')).rejects.toThrow()
    await expect(engine.parseAndRender('{% assign i = 7 %}{{ i }}')).resolves.toBe('7')
  })

  it('T33: a failed include restores registers and scope', async function () {
    mock({ '/boom': '{{ missing }}', '/ok': '{{ v }}' })
    const engine = new Liquid({ root: '/', strictVariables: true })
    await expect(engine.parseAndRender('{% include "boom" %}')).rejects.toThrow()
    await expect(engine.parseAndRender('{% include "ok", v: 1 %}')).resolves.toBe('1')
    restore()
  })
})
