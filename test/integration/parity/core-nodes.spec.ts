import { Liquid } from '../../../src/liquid'
import DocTag from '../../../src/tags/doc'

describe('parity: doc, ifchanged and self', function () {
  const liquid = new Liquid()

  it('T01: doc outputs nothing, retains its body and does not execute it', async function () {
    const src = '[{% doc %}{{ boom }}{% assign x = 1 %}text{% enddoc %}]{{ x }}'
    expect(await liquid.parseAndRender(src)).toBe('[]')
    const [, doc] = liquid.parse(src)
    expect((doc as InstanceType<typeof DocTag>).body).toBe('{{ boom }}{% assign x = 1 %}text')
  })

  it('T01: a strict-variable reference inside doc is never evaluated', async function () {
    const strict = new Liquid({ strictVariables: true })
    expect(await strict.parseAndRender('{% doc %}{{ missing }}{% enddoc %}ok')).toBe('ok')
  })

  it('T02: nested doc and opening arguments are syntax failures', function () {
    expect(() => liquid.parse('{% doc %}{% doc %}{% enddoc %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Nested doc tags are not allowed"
    )
    expect(() => liquid.parse('{% doc arg %}{% enddoc %}')).toThrow(
      "Syntax Error in 'doc' - Valid syntax: {% doc %}{% enddoc %}"
    )
    expect(() => liquid.parse('{% doc %}')).toThrow("'doc' tag was never closed")
  })

  it('T03: ifchanged suppresses repeats while still executing the body', async function () {
    const engine = new Liquid()
    let runs = 0
    engine.registerFilter('count', (v: unknown) => {
      runs++
      return v
    })
    const src = '{% for i in items %}{% ifchanged %}{{ i | count }}{% endifchanged %}{% endfor %}'
    expect(await engine.parseAndRender(src, { items: ['a', 'a', 'b'] })).toBe('ab')
    expect(runs).toBe(3)
  })

  it('T04: sibling ifchanged nodes share one register', async function () {
    const src =
      '{% for i in items %}{% ifchanged %}{{ i }}{% endifchanged %}{% ifchanged %}{{ i }}{% endifchanged %}{% endfor %}'
    expect(await liquid.parseAndRender(src, { items: ['a', 'b'] })).toBe('ab')
  })

  it('T05: self[key] follows ordinary scope precedence', async function () {
    const src = '{% assign k = "name" %}{{ self[k] }}'
    expect(await liquid.parseAndRender(src, { name: 'outer' })).toBe('outer')
    expect(await liquid.parseAndRender('{% assign name = "inner" %}' + src, { name: 'outer' })).toBe('inner')
  })

  it('T05: self cannot expose context internals', async function () {
    const src =
      '[{{ self.scopes }}][{{ self.registers }}][{{ self.opts }}][{{ self.environments }}][{{ self.globals }}]'
    expect(await liquid.parseAndRender(src)).toBe('[][][][][]')
  })

  it('T06: self reads nil for missing locals and environments', async function () {
    expect(await liquid.parseAndRender('[{{ self["nope"] }}]')).toBe('[]')
    expect(await liquid.parseAndRender('[{{ self["a"] }}]', { a: null })).toBe('[]')
    expect(await liquid.parseAndRender('[{{ self["a"] }}]', { a: 0 })).toBe('[0]')
  })

  it('T06: a user-defined self shadows the drop', async function () {
    expect(await liquid.parseAndRender('{{ self.a }}', { self: { a: 'mine' } })).toBe('mine')
    expect(await liquid.parseAndRender('{% assign self = "s" %}{{ self }}')).toBe('s')
  })

  it('T07: a SelfDrop passed into render keeps its originating scope', async function () {
    const engine = new Liquid({ templates: { leaf: '{{ s["secret"] }}' } })
    const src = '{% assign secret = "shh" %}{% render "leaf", s: self %}'
    expect(await engine.parseAndRender(src)).toBe('shh')
  })

  it('T07: self is one value within a context', async function () {
    expect(await liquid.parseAndRender('{% if self == self %}y{% else %}n{% endif %}')).toBe('y')
  })

  it('renders the new nodes', async function () {
    expect(await liquid.parseAndRender('{% doc %}x{% enddoc %}{{ self["a"] }}', { a: 1 })).toBe('1')
    expect(
      await liquid.parseAndRender('{% for i in items %}{% ifchanged %}{{ i }}{% endifchanged %}{% endfor %}', {
        items: ['a', 'a', 'b']
      })
    ).toBe('ab')
  })
})
