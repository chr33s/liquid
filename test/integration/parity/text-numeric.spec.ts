import { Liquid } from '../../../src/liquid'

describe('parity: numeric, encoding and text fidelity', function () {
  const liquid = new Liquid()
  const render = (src: string, scope: object = {}) => liquid.parseAndRender(src, scope)

  it('F01: h is an escape alias', async function () {
    expect(await render('{{ s | h }}', { s: '<a href="x">&\'</a>' })).toBe(
      await render('{{ s | escape }}', { s: '<a href="x">&\'</a>' })
    )
    expect(await render('{{ "<b>" | h }}')).toBe('&lt;b&gt;')
  })

  it('F02: URL-safe base64 round trips', async function () {
    expect(await render('{{ "a?b>c" | base64_url_safe_encode }}')).toBe('YT9iPmM=')
    expect(await render('{{ "a?b>c" | base64_url_safe_encode | base64_url_safe_decode }}')).toBe('a?b>c')
    expect(await render('{{ "one two" | base64_encode }}')).toBe('b25lIHR3bw==')
  })

  it('F03: malformed base64 is an argument failure', async function () {
    await expect(render('{{ "!!!" | base64_decode }}')).rejects.toThrow('invalid base64 provided')
    await expect(render('{{ "a?b" | base64_url_safe_decode }}')).rejects.toThrow('invalid base64 provided')
  })

  it('F13: integers divide as integers', async function () {
    expect(await render('{{ 5 | divided_by: 2 }}')).toBe('2')
    expect(await render('{{ 9 | divided_by: 2 }}')).toBe('4')
  })

  it('F14: a decimal divisor keeps the result decimal', async function () {
    expect(await render('{{ 5 | divided_by: 2.0 }}')).toBe('2.5')
    expect(await render('{{ 5.5 | divided_by: 2 }}')).toBe('2.75')
  })

  it.each([
    [1e-50, 1, '1.0e-50'],
    [-1e-50, 1, '-1.0e-50'],
    [1e-50, -2, '-5.0e-51'],
    [0.5, 1e100, '5.0e-101'],
    [Number.MIN_VALUE, 1, '5.0e-324'],
    [1e100, 0.5, '2.0e+100'],
    [0, 1e-50, '0.0']
  ])('preserves decimal division across magnitudes: %s / %s', async function (x, y, expected) {
    expect(await render('{{ x | times: 1.0 | divided_by: y }}', { x, y })).toBe(expected)
  })

  it('F15: numeric prefixes convert', async function () {
    expect(await render('{{ "12tail" | plus: 1 }}')).toBe('13')
    expect(await render('{{ "tail" | plus: 1 }}')).toBe('1')
    expect(await render('{{ "4.5" | plus: 1 }}')).toBe('5.5')
  })

  it('F16: integer zero arithmetic is a Liquid error, not Infinity or NaN', async function () {
    await expect(render('{{ 5 | divided_by: 0 }}')).rejects.toThrow('divided by 0')
    await expect(render('{{ 5 | modulo: 0 }}')).rejects.toThrow('divided by 0')
  })

  it('F16: a decimal operand follows the reference float path', async function () {
    // the reference divides through BigDecimal once either side is a decimal
    expect(await render('{{ 7 | divided_by: 0.0 }}')).toBe('Infinity')
    expect(await render('{{ 7.0 | divided_by: 0 }}')).toBe('Infinity')
    expect(await render('{{ -7 | divided_by: 0.0 }}')).toBe('-Infinity')
    expect(await render('{{ 0 | divided_by: 0.0 }}')).toBe('NaN')
    // modulo raises for a zero divisor whatever the operand kinds are
    await expect(render('{{ 7 | modulo: 0.0 }}')).rejects.toThrow('divided by 0')
    await expect(render('{{ 7.0 | modulo: 0 }}')).rejects.toThrow('divided by 0')
  })

  it('F16: division and modulo floor toward negative infinity', async function () {
    expect(await render('{{ -5 | divided_by: 3 }}')).toBe('-2')
    expect(await render('{{ 5 | divided_by: -3 }}')).toBe('-2')
    expect(await render('{{ -5 | modulo: 3 }}')).toBe('1')
    expect(await render('{{ 5 | modulo: -3 }}')).toBe('-1')
    expect(await render('{{ 7.5 | modulo: 3 }}')).toBe('1.5')
  })

  it('F18: the escaped double quote is &quot;', async function () {
    expect(await render("{{ '\"' | escape }}")).toBe('&quot;')
    expect(await render('{{ "\'" | escape }}')).toBe('&#39;')
  })

  it('F19: escape_once keeps recognized entities intact', async function () {
    expect(await render('{{ "&quot;a&quot;" | escape_once }}')).toBe('&quot;a&quot;')
    expect(await render('{{ "&nbsp;" | escape_once }}')).toBe('&nbsp;')
    expect(await render('{{ "&#34;" | escape_once }}')).toBe('&#34;')
    expect(await render('{{ "1 & 2" | escape_once }}')).toBe('1 &amp; 2')
  })

  it('F20: url_encode escapes CGI punctuation', async function () {
    expect(await render('{{ "!\'()*" | url_encode }}')).toBe('%21%27%28%29%2A')
    expect(await render('{{ "a b" | url_encode }}')).toBe('a+b')
  })

  it('F21: malformed percent escapes are left as written', async function () {
    expect(await render('{{ "a%zzb" | url_decode }}')).toBe('a%zzb')
    expect(await render('{{ "a%2" | url_decode }}')).toBe('a%2')
    expect(await render('{{ "a+b%20c" | url_decode }}')).toBe('a b c')
    await expect(render('{{ "%FF%FE" | url_decode }}')).rejects.toThrow('invalid byte sequence')
  })

  it('F22: an exact word count is not truncated', async function () {
    expect(await render('{{ "a b" | truncatewords: 2 }}')).toBe('a b')
  })

  it('F23: a no-op truncatewords preserves the original whitespace', async function () {
    expect(await render('{{ "  a   b  " | truncatewords: 5 }}')).toBe('  a   b  ')
  })

  it('F24: an empty replacement pattern matches at every position', async function () {
    expect(await render('{{ "ab" | replace: "", "-" }}')).toBe('-a-b-')
  })

  it('F25: splitting on a single space uses whitespace runs', async function () {
    expect(await render('{{ " a  b " | split: " " | join: "|" }}')).toBe('a|b')
  })

  it('F26: size, slice and truncate count characters', async function () {
    const scope = { s: '𝌆𝌇𝌈' }
    expect(await render('{{ s | size }}', scope)).toBe('3')
    expect(await render('{{ s | slice: 1, 1 }}', scope)).toBe('𝌇')
    expect(await render('{{ s | truncate: 2, "" }}', scope)).toBe('𝌆𝌇')
  })

  it('F27: an empty format returns the input, and a missing one errors under core parity', async function () {
    expect(await render('{{ "2022-12-08" | date: "" }}')).toBe('2022-12-08')
    const core = new Liquid({ dateFormat: '' })
    expect(await core.parseAndRender('{{ "2022-12-08" | date: nil }}')).toBe('2022-12-08')
    await expect(core.parseAndRender('{{ "2022-12-08" | date }}')).rejects.toThrow('date filter requires a format')
  })

  it('F28: date conversion is deterministic for offset inputs and now/today', async function () {
    const fixed = new Liquid({ timezoneOffset: 0 })
    expect(await fixed.parseAndRender('{{ "2025-01-02 03:04:05 -0100" | date: "%Y-%m-%dT%H:%M:%S" }}')).toBe(
      '2025-01-02T04:04:05'
    )
    const now = await fixed.parseAndRender('{{ "now" | date: "%Y" }}')
    expect(now).toMatch(/^\d{4}$/)
    // the keywords are case-insensitive, as in the reference
    expect(await fixed.parseAndRender('{{ "NOW" | date: "%Y" }}')).toBe(now)
  })
})
