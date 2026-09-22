import { Liquid } from '../../../src/liquid'

describe('parity: conditions, modes and error lifecycle', function () {
  const liquid = new Liquid()

  it('T08: <> is an inequality alias', async function () {
    expect(await liquid.parseAndRender('{% if 1 <> 2 %}y{% else %}n{% endif %}')).toBe('y')
    expect(await liquid.parseAndRender('{% if 2 <> 2 %}y{% else %}n{% endif %}')).toBe('n')
    expect(await liquid.parseAndRender('{% if "a" <> "b" %}y{% endif %}')).toBe('y')
  })

  it('T09: `and` does not evaluate its right operand when the left is false', async function () {
    const strict = new Liquid({ strictVariables: true })
    expect(await strict.parseAndRender('{% if false and missing %}y{% else %}n{% endif %}')).toBe('n')
  })

  it('T10: `or` does not evaluate its right operand when the left is true', async function () {
    let called = 0
    const engine = new Liquid()
    engine.registerFilter('track', (v: unknown) => {
      called++
      return v
    })
    expect(await engine.parseAndRender('{% if true or missing %}y{% endif %}')).toBe('y')
    expect(await engine.parseAndRender('{% assign x = false %}{{ x | track }}')).toBe('false')
    expect(called).toBe(1)
  })

  it('T11: mixed and/or chains keep reference association and order', async function () {
    // the reference grammar binds right to left: `a or b and c` is `a or (b and c)`
    expect(await liquid.parseAndRender('{% if true or false and false %}y{% else %}n{% endif %}')).toBe('y')
    expect(await liquid.parseAndRender('{% if false and true or true %}y{% else %}n{% endif %}')).toBe('n')
  })

  it('T11: short circuit applies across a chain', async function () {
    const strict = new Liquid({ strictVariables: true })
    expect(await strict.parseAndRender('{% if false and missing and alsoMissing %}y{% else %}n{% endif %}')).toBe('n')
    expect(await strict.parseAndRender('{% if true or missing or alsoMissing %}y{% else %}n{% endif %}')).toBe('y')
  })

  it('T12: lax mode ignores trailing markup', async function () {
    expect(await liquid.parseAndRender('{{ a b }}', { a: 1, b: 2 })).toBe('1')
    expect(await liquid.parseAndRender('{% assign x = 1 2 %}{{ x }}')).toBe('1')
  })

  it('T12: strict mode rejects trailing markup', function () {
    const strict = new Liquid({ errorMode: 'strict' })
    // outputs, conditions and loops use the reference's strict parser
    expect(() => strict.parse('{{ a b }}')).toThrow('Expected end_of_string but found id')
    // assign reads its value with the strict variable grammar
    expect(() => strict.parse('{% assign x = 1 2 %}')).toThrow('Expected end_of_string but found number in "x = 1 2"')
    expect(() => strict.parse('{% if a b %}x{% endif %}')).toThrow('Expected end_of_string but found id')
    expect(() => strict.parse('{% echo a b %}')).toThrow('Expected end_of_string but found id')
    expect(() => strict.parse('{{ a }}')).not.toThrow()
  })

  it('T12: warn mode records and continues', async function () {
    const warn = new Liquid({ errorMode: 'warn' })
    expect(await warn.parseAndRender('{{ a b }}', { a: 1 })).toBe('1')
    expect(warn.warnings).toEqual([expect.stringContaining('unexpected token "b"')])
  })

  it('E01: unknown filters are permissive by default and strict on demand', async function () {
    expect(await liquid.parseAndRender('{{ "x" | nope }}')).toBe('x')
    const strict = new Liquid({ strictFilters: true })
    expect(() => strict.parse('{{ "x" | nope }}')).not.toThrow()
    await expect(strict.parseAndRender('{{ "x" | nope }}')).rejects.toThrow('undefined filter: nope')
  })

  it('E01: strictFilters can be decided per render', async function () {
    const templates = liquid.parse('{{ "x" | nope }}')
    expect(await liquid.render(templates)).toBe('x')
    await expect(liquid.render(templates, {}, { strictFilters: true })).rejects.toThrow('undefined filter: nope')
  })

  it('E02: aggregate collection and raising policies differ in the errors they reject with', async function () {
    const raising = new Liquid({ strictVariables: true })
    const collecting = new Liquid({ strictVariables: true, catchAllErrors: true })
    const src = '{{ a }}|{{ b }}'
    await expect(raising.parseAndRender(src)).rejects.toMatchObject({ name: 'UndefinedVariableError' })
    await expect(collecting.parseAndRender(src)).rejects.toMatchObject({
      name: 'LiquidErrors',
      errors: [{ name: 'UndefinedVariableError' }, { name: 'UndefinedVariableError' }]
    })
  })

  it('E03: one parsed AST resolves different render-local filters', async function () {
    const templates = liquid.parse('{{ "x" | tag }}')
    expect(await liquid.render(templates, {}, { filters: { tag: (v: string) => `<${v}>` } })).toBe('<x>')
    expect(await liquid.render(templates, {}, { filters: { tag: (v: string) => `[${v}]` } })).toBe('[x]')
    expect(await liquid.render(templates)).toBe('x')
  })

  it.each([false, true])(
    'reports a failed property read with async=%s under both error policies',
    async function (async) {
      const error = new Error('provider failed')
      const scope = {
        value() {
          if (async) return Promise.reject(error)
          throw error
        }
      }
      await expect(liquid.parseAndRender('{{ value }}', scope)).rejects.toMatchObject({
        name: 'RenderError',
        originalError: error
      })
      expect(await liquid.parseAndRender('before {{ value }} after', scope, { renderErrors: 'inline' })).toBe(
        'before Liquid error (line 1): provider failed after'
      )
    }
  )

  it('E03: caching cannot freeze a filter set across renders', async function () {
    const cached = new Liquid({ cache: true })
    const templates = cached.parse('{{ "x" | tag }}')
    expect(await cached.render(templates, {}, { filters: { tag: () => 'A' } })).toBe('A')
    expect(await cached.render(templates, {}, { filters: { tag: () => 'B' } })).toBe('B')
  })

  it('E03: render-local filters reach partials', async function () {
    const engine = new Liquid({ templates: { leaf: '{{ "x" | tag }}' } })
    const templates = engine.parse('{% render "leaf" %}')
    expect(await engine.render(templates, {}, { filters: { tag: () => 'A' } })).toBe('A')
    expect(await engine.render(templates, {}, { filters: { tag: () => 'B' } })).toBe('B')
  })

  it('E05: sync and async paths agree', async function () {
    const src = '{% if false and missing %}y{% else %}n{% endif %}{{ 1 <> 2 }}'
    const strict = new Liquid({ strictVariables: true })
    expect(await strict.parseAndRender(src)).toBe(await strict.parseAndRender(src))
  })
})
