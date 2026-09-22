import { Liquid } from '../../../src/liquid'

/**
 * Lax mode reads markup the engine cannot read as written the way the pinned
 * reference's lax parser does; each expected value was observed there.
 */
describe('parity: lax mode', function () {
  const liquid = new Liquid({ templates: { snippet: 'hello {{ arg1 }} {{ arg2 }}' } })
  const render = async (src: string, scope: object = {}) => await liquid.parseAndRender(src, scope)

  it('skips junk around the expression and filters of an output', async function () {
    expect(await render("{{ 'X' | downcase) }}")).toBe('x')
    expect(await render("{{ 'hi there' | split$$$:' ' | first }}")).toBe('hi')
    expect(await render('{{ false = }}')).toBe('false')
    expect(await render("{{['foo'}}", { foo: 'bar' })).toBe('bar')
  })

  it('reads a lookup from the words and brackets it finds', async function () {
    const scope = { foo: { bar: 'baz' } }
    expect(await render("{% case foo=>bar %}{% when 'baz' %}one{% else %}two{% endcase %}", scope)).toBe('one')
    expect(await render('{% for i in (1...5) %}{{ i }}{% endfor %}')).toBe('12345')
  })

  it('evaluates conditions left to right and rejects an unknown operator when reached', async function () {
    expect(await render('{% if true && false %}YES{% endif %}')).toBe('YES')
    const scope = { b: 'bar', c: 'baz' }
    expect(await render("{% if a == 'foo' or (b == 'bar' and c == 'baz') or false %}YES{% endif %}", scope)).toBe('YES')
    expect(await render('{% if true or false foo %}YES{% endif %}')).toBe('YES')
    await expect(render('{% if false or 1 foo 2 %}YES{% endif %}')).rejects.toThrow('Unknown operator foo')
  })

  it('finds tag attributes anywhere in the markup', async function () {
    expect(await render("{% include 'snippet' !!! arg1: 'value1' ~~~ arg2: 'value2' %}")).toBe('hello value1 value2')
    expect(await render("{% for i in (1..3) %}{% cycle 'odd': %},{% endfor %}")).toBe(',,,')
  })

  it('leaves markup that reads as written alone', async function () {
    expect(
      await render('{{ product.title | upcase }}|{% if a == 1 %}y{% endif %}', { product: { title: 't' }, a: 1 })
    ).toBe('T|y')
    expect(await render('{% if 1 < 2 and 3 > 2 %}y{% endif %}{{ 1 | plus: 1 }}')).toBe('y2')
  })
})
