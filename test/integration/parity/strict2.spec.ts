import { Liquid } from '../../../src/liquid'

/**
 * The `strict2` grammar of the pinned reference engine (Shopify/liquid
 * 4e39ae4), whose messages the liquid-spec `parser_errors` suite matches.
 */
describe('parity: strict2 grammar', function () {
  const liquid = new Liquid({ errorMode: 'strict2', templates: { t: '{{ a }}' } })
  const reject = (src: string, message: string) => expect(() => liquid.parse(src), src).toThrow(message)

  it('lexes markup into the reference tokens', function () {
    reject('{{ a ~ b }}', 'Unexpected character ~')
    reject("{{ 'open }}", "Unexpected character '")
    reject('{% if a = b %}{% endif %}', 'Unexpected character =')
  })

  it('reports the token an expression or a required token did not find', function () {
    reject('{{ a | }}', 'Expected id but found end_of_string')
    reject('{{ a.b. }}', 'Expected id but found end_of_string')
    reject('{{ a[0 }}', 'Expected close_square but found end_of_string')
    reject('{{ , }}', '[:comma, ","] is not a valid expression')
    reject('{% if a == %}{% endif %}', '[:end_of_string] is not a valid expression')
    reject('{{ a b }}', 'Expected end_of_string but found id')
  })

  it('checks each tag the way the reference tag does', function () {
    reject('{% assign %}', "Syntax Error in 'assign' - Valid syntax: assign [var] = [source]")
    reject('{% assign a.b = 1 %}', 'Expected end_of_string but found dot')
    reject('{% capture a b %}{% endcapture %}', 'Expected end_of_string but found id')
    reject('{% for i %}{% endfor %}', "For loops require an 'in' clause")
    reject(
      '{% for i in a step: 2 %}{% endfor %}',
      'Invalid attribute in for loop. Valid attributes are limit and offset'
    )
    reject(
      '{% tablerow i in a step: 2 %}{% endtablerow %}',
      "Invalid attribute 'step' in tablerow loop. Valid attributes are cols, limit, offset, and range"
    )
    reject('{% cycle %}', "Syntax Error in 'cycle' - Valid syntax: cycle [name :] var [, var2, var3 ...]")
    reject('{% case a %}{% when 1 2 %}{% endcase %}', 'Expected end_of_string but found number')
    reject('{% case a %}{% else x %}{% endcase %}', "Syntax Error in tag 'case' - Valid else condition")
    reject('{% render t %}', 'Expected string but found id')
    reject('{% include "t" x %}', 'Expected colon but found end_of_string')
    reject('{% if a %}{% elsif %}{% endif %}', '[:end_of_string] is not a valid expression')
  })

  it('accepts what the reference accepts', async function () {
    const src = [
      '{% assign a = 1 | plus: 2, %}',
      '{% for i in (1..3) reversed, limit: 2 %}{{ i }}{% endfor %}',
      "{% cycle 'x': 1, 2, %}",
      '{% case a %}{% when 3 or 4, 5 %}y{% endcase %}',
      "{% render 't', a: 1, %}",
      '{{ a | default: 1, allow_false: true, }}'
    ].join('')
    expect(await liquid.parseAndRender(src)).toBe('211y13')
  })

  it('reports structural errors in the reference wording in every mode', function () {
    for (const errorMode of ['lax', 'strict', 'strict2'] as const) {
      const engine = new Liquid({ errorMode })
      expect(() => engine.parse('{% nope %}')).toThrow("Unknown tag 'nope'")
      expect(() => engine.parse('{% if a %}')).toThrow("'if' tag was never closed")
      expect(() => engine.parse('{% if a %}{% endfor %}')).toThrow(
        "'endfor' is not a valid delimiter for if tags. use endif"
      )
      expect(() => engine.parse('{% else %}')).toThrow("Unexpected outer 'else' tag")
      expect(() => engine.parse('{% raw x %}{% endraw %}')).toThrow("Syntax Error in 'raw' - Valid syntax: raw")
    }
  })

  it('renders what the grammar reads', async function () {
    const engine = new Liquid({ errorMode: 'strict2', templates: { p: '[{{ y }}|{{ k }}]' } })
    const render = async (src: string, scope = {}) => await engine.parseAndRender(src, scope)
    expect(await render('{{ a? | append: b-c }}', { 'a?': 1, 'b-c': 2 })).toBe('12')
    expect(await render('{% for i in (1..5) reversed limit: 2 %}{{ i }}{% endfor %}')).toBe('21')
    expect(await render("{% include 'p' with 3 as y, k: 4 %}")).toBe('[3|4]')
    expect(
      await render('{% case 2 %}{% when 1 or 2 %}w{% endcase %}{% if 1 < 2 and 3 > 4 or true %}y{% endif %}')
    ).toBe('wy')
  })
})
