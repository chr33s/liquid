import { Liquid } from '../../../src/liquid'

describe('LiquidOptions#*outputEscape*', function () {
  it('uses the active final filter raw flag for concurrent renders of one template', async function () {
    const engine = new Liquid({ outputEscape: 'escape' })
    engine.registerFilter('last', { raw: true, handler: (value: unknown) => value })
    const templates = engine.parse('{{ "<b>" | last }}')
    const handler = async (value: unknown) => value
    expect(
      await Promise.all([
        engine.render(templates, {}, { filters: { last: handler } }),
        engine.render(templates, {}, { filters: { last: { raw: true, handler } } })
      ])
    ).toEqual(['&lt;b&gt;', '<b>'])
    engine.registerFilter('last', handler)
    expect(await engine.render(templates)).toBe('&lt;b&gt;')
    const local = engine.parse('{{ "<b>" | only_local }}')
    expect(await engine.render(local, {}, { filters: { only_local: { raw: true, handler } } })).toBe('<b>')
    expect(await engine.render(local)).toBe('&lt;b&gt;')
  })

  it('when outputEscape is not set', async function () {
    const engine = new Liquid()
    const html = await engine.parseAndRender('{{"<"}}')
    expect(html).toBe('<')
  })

  it('should escape when outputEscape="escape"', async function () {
    const engine = new Liquid({
      outputEscape: 'escape'
    })
    const html = await engine.parseAndRender('{{"<"}}')
    expect(html).toBe('&lt;')
  })

  it('should json stringify when outputEscape="json"', async function () {
    const engine = new Liquid({
      outputEscape: 'json'
    })
    const html = await engine.parseAndRender('{{"<"}}')
    expect(html).toBe('"<"')
  })

  it('should support outputEscape=Function', async function () {
    const engine = new Liquid({
      outputEscape: (v: any) => `{${v}}`
    })
    const html = await engine.parseAndRender('{{"<"}}')
    expect(html).toBe('{<}')
  })

  it('should skip escape for output whose last filter is registered raw', async function () {
    const engine = new Liquid({
      outputEscape: 'escape'
    })
    engine.registerFilter('unescaped', { raw: true, handler: (v: unknown) => v })
    const html = await engine.parseAndRender('{{"<" | unescaped}}')
    expect(html).toBe('<')
  })
})
