import { Liquid } from '../../../src/liquid'

/**
 * Behaviour of the pinned reference engine (Shopify/liquid 4e39ae4) the
 * liquid-spec corpus exercises; each expected value was observed there.
 */
describe('parity: reference semantics', function () {
  const liquid = new Liquid({ errorMode: 'strict2' })
  const render = async (src: string, scope: object = {}) => await liquid.parseAndRender(src, scope)

  it('prints a range as its bounds and a hash or array as Ruby inspects it in filters', async function () {
    expect(await render('{{ (1..5) }}|{% assign r = (3..1) %}{{ r }}')).toBe('1..5|3..1')
    expect(await render('{{ h | join }}|{{ a | upcase }}|{{ a }}', { h: { a: 1 }, a: ['x', 'y'] })).toBe(
      '{"a"=>1}|["X", "Y"]|xy'
    )
  })

  it('keeps integers past 2**53 exact', async function () {
    expect(await render('{{ 9223372036854775808 | plus: 1 }}')).toBe('9223372036854775809')
    expect(await render('{% if 1 < 18446744073709551616 %}y{% endif %}')).toBe('y')
  })

  it('computes float arithmetic on the decimal spelling', async function () {
    expect(await render('{{ 0.1 | plus: 0.2 }}|{{ 2.5 | times: 2.9 }}|{{ a | sum }}', { a: [0.1, 0.2, 0.3] })).toBe(
      '0.3|7.25|0.6'
    )
  })

  it('orders only values that can be ordered', async function () {
    expect(await render('{% if 5 > true %}Y{% else %}N{% endif %}')).toBe('N')
    await expect(render('{% if 5 > "x" %}Y{% endif %}')).rejects.toThrow('comparison of Integer with String failed')
    await expect(render('{{ a | sort }}', { a: [1, 'a'] })).rejects.toThrow('cannot sort values of incompatible types')
  })

  it('answers commands on dot lookups only', async function () {
    expect(await render('{{ s.first }}{{ s.last }}{{ s.size }}|{{ s[0] }}', { s: 'hello' })).toBe('ho5|')
    expect(await render("{{ h.first }}|{{ h['first'] }}", { h: { a: 1 } })).toBe('a1|')
    expect(await render("{{ a['first'] }}|{{ a.first }}", { a: [1, 2] })).toBe('|1')
  })

  it('renders every matching when value and the first else', async function () {
    expect(await render('{% case 1 %}{% when 1, 1 %}x{% else %}e{% endcase %}')).toBe('xx')
    expect(await render('{% if false %}{% else %}a{% else %}b{% endif %}')).toBe('a')
  })

  it('reads a string literal without escapes', async function () {
    expect(await render("{{ 'a\\nb' }}")).toBe('a\\nb')
    expect(await render("{{ 'abc' | replace: 'b', '[\\0]' }}")).toBe('a[b]c')
  })

  it('drops whitespace from a block whose nodes are all blank', async function () {
    expect(await render('{% for i in (1..3) %}  {% assign x = i %}  {% endfor %}|')).toBe('|')
    expect(await render('{% for i in (1..2) %} {{ i }} {% endfor %}')).toBe(' 1  2 ')
  })

  it('renders a cycle value as text', async function () {
    expect(await render('{% cycle true, false %}{% cycle true, false %}')).toBe('truefalse')
  })

  it('reads only the first expression of each lax cycle value', async function () {
    const source = '{% for i in (1..3) %}{% cycle value (1..2), "b" %}{% endfor %}'
    expect(await new Liquid({ errorMode: 'lax' }).parseAndRender(source, { value: 'a' })).toBe('aba')
  })

  it('reads numbers and integers as Ruby does', async function () {
    expect(await render("{{ '1_000' | plus: 0 }}|{{ 'abc' | truncate: ' 2 ' }}")).toBe('1000|...')
    await expect(render("{{ 'abc' | truncate: 1.5 }}")).rejects.toThrow('invalid integer')
  })

  it('splits words on ASCII whitespace only', async function () {
    expect(await render("{{ 'a b c d' | truncatewords: 2 }}|{{ s | truncatewords: 1 }}", { s: 'a b c' })).toBe(
      'a b...|a b...'
    )
  })

  it('formats dates with the reference directives and keeps a given offset', async function () {
    expect(await render("{{ '2016-01-04 13:15:23' | date: '%c|%D|%F|%T|%G-%V' }}")).toBe(
      'Mon Jan  4 13:15:23 2016|01/04/16|2016-01-04|13:15:23|2016-01'
    )
    expect(await render("{{ '2020-06-15 14:30:00 -0400' | date: '%H %z' }}")).toBe('14 -0400')
    expect(await render("{{ 'NOW' | date: '%Y' }}")).toMatch(/^\d{4}$/)
  })

  it('never writes the inline error of an assign', async function () {
    const engine = new Liquid({ errorMode: 'strict2', renderErrors: 'inline' })
    expect(await engine.parseAndRender('before{% assign v = "x" | truncate: nil %}after[{{ v }}]')).toBe(
      'beforeafter[]'
    )
  })

  it('stops nesting at 100 scopes, recoverably under the inline policy', async function () {
    const engine = new Liquid({ templates: { loop: "{% include 'loop' %}" }, renderErrors: 'inline' })
    expect(await engine.parseAndRender("a{% include 'loop' %}b")).toMatch(
      /^aLiquid error \(loop line 1\): Nesting too deep/
    )
  })
})
