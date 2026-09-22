import { Liquid } from '../../../src/liquid'

describe('parity: collection semantics and built-in signatures', function () {
  const liquid = new Liquid()
  const render = (src: string, scope: object = {}) => liquid.parseAndRender(src, scope)

  it('sorts mixed numeric values without rounding large integers', async function () {
    const arr = [9007199254740993n, 9007199254740992, 9007199254740995n, 9007199254740994n, 1, -2n, 1.5]
    const expected = '-2,1,1.5,9007199254740992,9007199254740993,9007199254740994,9007199254740995'
    expect(await render('{{ arr | sort | join: "," }}', { arr })).toBe(expected)
    expect(await render('{{ arr | sort: "id" | map: "id" | join: "," }}', { arr: arr.map(id => ({ id })) })).toBe(
      expected
    )
    await expect(render('{{ arr | sort }}', { arr: [1n, '2'] })).rejects.toThrow(
      'cannot sort values of incompatible types'
    )
  })

  it('F04: property filters use the literal key', async function () {
    const arr = [{ 'a.b': 1, a: { b: 99 } }, { 'a.b': 2 }]
    expect(await render('{{ arr | map: "a.b" | join: "," }}', { arr })).toBe('1,2')
    expect(await render('{{ arr | where: "a.b", 2 | map: "a.b" | join }}', { arr })).toBe('2')
  })

  it('F05: uniq is property aware', async function () {
    const arr = [
      { id: 1, n: 'a' },
      { id: 1, n: 'b' },
      { id: 2, n: 'c' }
    ]
    expect(await render('{{ arr | uniq: "id" | map: "n" | join: "," }}', { arr })).toBe('a,c')
    expect(await render('{{ arr | uniq | size }}', { arr })).toBe('3')
  })

  it('F06: compact is property aware', async function () {
    const arr = [{ id: 1 }, { id: null }, { id: 2 }, {}]
    expect(await render('{{ arr | compact: "id" | map: "id" | join: "," }}', { arr })).toBe('1,2')
    expect(await render('{{ arr | compact | size }}', { arr })).toBe('4')
  })

  it('F07: flattening applies only to iterator-based filters', async function () {
    const nested = [1, [2, [3]]]
    expect(await render('{{ n | join: "," }}', { n: nested })).toBe('1,2,3')
    expect(await render('{{ n | uniq | size }}', { n: nested })).toBe('3')
    // slice and first/last read the input as given
    expect(await render('{{ n | size }}', { n: nested })).toBe('2')
    expect(await render('{{ n | slice: 1, 1 | size }}', { n: nested })).toBe('1')
  })

  it('F08: structurally equal objects compare equal', async function () {
    const scope = { a: { x: 1, y: [1, 2] }, b: { y: [1, 2], x: 1 }, c: { x: 2 } }
    expect(await render('{% if a == b %}y{% else %}n{% endif %}', scope)).toBe('y')
    expect(await render('{% if a == c %}y{% else %}n{% endif %}', scope)).toBe('n')
    expect(await render('{{ arr | uniq | size }}', { arr: [{ x: 1 }, { x: 1 }, { x: 2 }] })).toBe('2')
  })

  it('F09: a two-key object has size 2', async function () {
    expect(await render('{{ o | size }}', { o: { a: 1, b: 2 } })).toBe('2')
    expect(await render('{{ o.size }}', { o: { a: 1, b: 2 } })).toBe('2')
    expect(await render('{{ s | size }}', { s: 'abc' })).toBe('3')
  })

  it('F10: default treats an empty object as empty and distinguishes allow_false', async function () {
    expect(await render('{{ o | default: "fallback" }}', { o: {} })).toBe('fallback')
    expect(await render('{{ o | default: "fallback" }}', { o: { a: 1 } })).toBe('{"a"=>1}')
    expect(await render('{{ f | default: "fallback" }}', { f: false })).toBe('fallback')
    expect(await render('{{ f | default: "fallback", allow_false: true }}', { f: false })).toBe('false')
  })

  it('F11: concat rejects a scalar right operand', async function () {
    await expect(render('{{ a | concat: 1 }}', { a: [1] })).rejects.toThrow('concat filter requires an array argument')
    expect(await render('{{ a | concat: b | join: "," }}', { a: [1], b: [2] })).toBe('1,2')
  })

  it('F12: missing and extra arguments are rejected separately from explicit nil', async function () {
    await expect(render('{{ "a" | append }}')).rejects.toThrow('(given 1, expected 2)')
    await expect(render('{{ "a" | append: "b", "c" }}')).rejects.toThrow('(given 3, expected 2)')
    expect(await render('{{ "a" | append: nil }}')).toBe('a')
    await expect(render('{{ 1 | abs: 2 }}')).rejects.toThrow('(given 2, expected 1)')
  })

  it('F12: user filters are not arity checked', async function () {
    const engine = new Liquid()
    engine.registerFilter('anything', (v: unknown, ...args: unknown[]) => `${v}:${args.length}`)
    expect(await engine.parseAndRender('{{ "a" | anything: 1, 2, 3 }}')).toBe('a:3')
  })

  it('F17: invalid slice arguments and incomparable sort values are rejected', async function () {
    await expect(render('{{ "abcdef" | slice: "x" }}')).rejects.toThrow('invalid integer')
    await expect(render('{{ arr | sort }}', { arr: [{ a: 1 }, { b: 2 }] })).rejects.toThrow(
      'cannot sort values of incompatible types'
    )
    expect(await render('{{ "abcdef" | slice: 1, 2 }}')).toBe('bc')
  })
})
