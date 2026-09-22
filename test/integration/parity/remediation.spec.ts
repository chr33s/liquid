import { Liquid } from '../../../src/liquid'
import { Drop } from '../../../src/drop'
import { LiquidError, ResourceLedger } from '../../../src/util'

/**
 * Acceptance cases of the remediation specification for 3f0e71a. Expected
 * values were observed on the pinned Ruby reference (Shopify/liquid 4e39ae4).
 */
describe('parity: remediation of review 3f0e71a', function () {
  describe('R2: parsing', function () {
    it('P01: a missing right-hand condition fails at parse time', function () {
      for (const errorMode of ['strict', 'strict2'] as const) {
        const engine = new Liquid({ errorMode })
        expect(() => engine.parse('{% if true and %}Y{% else %}N{% endif %}')).toThrow(
          '[:end_of_string] is not a valid expression'
        )
        expect(() => engine.parse('{% if a == 1 or %}Y{% endif %}')).toThrow(
          '[:end_of_string] is not a valid expression'
        )
      }
      // strict mode reads an assigned value with the strict variable grammar
      expect(() => new Liquid({ errorMode: 'strict' }).parse('{% assign x = a and %}')).toThrow(
        'Expected end_of_string but found id in "x = a and"'
      )
      const strict2 = new Liquid({ errorMode: 'strict2' })
      expect(() => strict2.parse('{% if true and %}Y{% else %}N{% endif %}')).toThrow(
        '[:end_of_string] is not a valid expression'
      )
      expect(() => strict2.parse('{{ a and }}')).toThrow('Expected end_of_string but found id')
    })

    it('P02: strict2 rejects a bare bracket lookup wherever an expression starts', function () {
      const engine = new Liquid({ errorMode: 'strict2' })
      for (const src of [
        "{{ ['product'] }}",
        '{{ ["product"] }}',
        '{{ [key] }}',
        "{% for item in ['collection'] %}{{ item }}{% endfor %}",
        "{% if ['product'] == true %}hello{% endif %}",
        "{% case ['product'] %}{% when 'a' %}hello{% endcase %}",
        "{% assign x = ['product'] %}"
      ]) {
        expect(() => engine.parse(src), src).toThrow("Bare bracket access is not allowed. Use self['...'] instead")
      }
    })

    it('P02: strict2 keeps qualified and self bracket access', async function () {
      const engine = new Liquid({ errorMode: 'strict2' })
      const scope = { product: { title: 'Cool' }, key: 'product' }
      expect(await engine.parseAndRender("{{ product['title'] }}|{{ self['product'].title }}", scope)).toBe('Cool|Cool')
      expect(await engine.parseAndRender('{{ self[key].title }}', scope)).toBe('Cool')
      expect(await new Liquid({ errorMode: 'strict' }).parseAndRender("{{ ['key'] }}", scope)).toBe('product')
    })

    it('P03: a skipped operand is never evaluated', async function () {
      let reads = 0
      class Counting extends Drop {
        liquidMethodMissing() {
          reads++
          throw new Error('evaluated')
        }
      }
      const engine = new Liquid({ errorMode: 'strict2', strictVariables: true })
      const scope = { d: new Counting() }
      expect(await engine.parseAndRender('{% if false and d.x %}Y{% else %}N{% endif %}', scope)).toBe('N')
      expect(await engine.parseAndRender('{% if true or d.x %}Y{% else %}N{% endif %}', scope)).toBe('Y')
      expect(await engine.parseAndRender('{% if false and missing %}Y{% else %}N{% endif %}')).toBe('N')
      expect(await engine.parseAndRender('{% if true or missing %}Y{% else %}N{% endif %}')).toBe('Y')
      expect(reads).toBe(0)
    })
  })

  describe('R3: error lifecycle', function () {
    const partials = {
      outer: "{% include 'inner' %}",
      level1: "{% render 'level2' %}",
      level2: "{% include 'inner' %}",
      inner: 'should not render'
    }

    it('E01: a forbidden include raises a render error', async function () {
      const engine = new Liquid({ templates: partials })
      for (const src of ["{% render 'outer' %}", "{% render 'level1' %}"]) {
        await expect(engine.parseAndRender(src)).rejects.toMatchObject({
          name: 'RenderError',
          message: expect.stringContaining('include usage is not allowed in this context')
        })
      }
    })

    it('E02: under the inline policy a forbidden include is a diagnostic', async function () {
      const engine = new Liquid({ templates: partials, renderErrors: 'inline' })
      const errors: LiquidError[] = []
      const html = await engine.parseAndRender("a{% render 'outer' %}b", {}, { onError: e => errors.push(e) })
      expect(html).toBe('aLiquid error (outer line 1): include usage is not allowed in this contextb')
      expect(errors.map(e => e.summary)).toEqual(['include usage is not allowed in this context'])
      expect(errors[0].token.getPosition()[0]).toBe(1)
    })

    it('E03: the recovering policy keeps the surrounding output', async function () {
      const src = 'before{{ 1 | divided_by: 0 }}after\n{{ 2 | divided_by: 0 }}'
      await expect(new Liquid().parseAndRender(src)).rejects.toThrow('divided by 0')
      const errors: LiquidError[] = []
      const html = await new Liquid().parseAndRender(src, {}, { renderErrors: 'inline', onError: e => errors.push(e) })
      expect(html).toBe('beforeLiquid error (line 1): divided by 0after\nLiquid error (line 2): divided by 0')
      expect(errors.map(e => [e.summary, e.token.getPosition()[0]])).toEqual([
        ['divided by 0', 1],
        ['divided by 0', 2]
      ])
    })

    it('E03: aggregate collection stays a separate policy', async function () {
      const engine = new Liquid({ strictVariables: true, catchAllErrors: true })
      await expect(engine.parseAndRender('{{ a }}|{{ b }}')).rejects.toMatchObject({
        name: 'LiquidErrors',
        errors: [{ name: 'UndefinedVariableError' }, { name: 'UndefinedVariableError' }]
      })
    })

    it('E03: exceeding a resource limit stops the inline policy too', async function () {
      const engine = new Liquid({ renderErrors: 'inline', templateLimit: 6 })
      expect(await engine.parseAndRender('x{% for i in (1..3) %}{{ i }}{% endfor %}')).toBe(
        'Liquid error (line 1): Memory limits exceeded: template limit exceeded'
      )
    })
  })

  describe('R4: work budgets', function () {
    const loop = '{% for i in (1..3) %}{{ i }}{% endfor %}'

    it('W01/W02: a nonempty range loop costs its tag, each item and each body node', async function () {
      expect(await new Liquid({ templateLimit: 7 }).parseAndRender(loop)).toBe('123')
      await expect(new Liquid({ templateLimit: 6 }).parseAndRender(loop)).rejects.toThrow('Memory limits exceeded')
    })

    it('W03: an empty body is charged once per item, dynamic bounds included', async function () {
      const src = '{% for i in (first..last) %}{% endfor %}'
      const scope = { first: 1, last: 3 }
      await expect(new Liquid({ templateLimit: 3 }).parseAndRender(src, scope)).rejects.toThrow(
        'Memory limits exceeded'
      )
      expect(await new Liquid({ templateLimit: 4 }).parseAndRender(src, scope)).toBe('')
      expect(
        await new Liquid({ templateLimit: 1 }).parseAndRender('{% for i in a %}{% endfor %}', { a: [1, 2, 3] })
      ).toBe('')
    })

    it('W04: skipped and unvisited items are not charged', async function () {
      const offset = '{% for i in (1..10) offset:7 limit:2 %}{{ i }}{% endfor %}'
      expect(await new Liquid({ templateLimit: 5 }).parseAndRender(offset)).toBe('89')
      const early = '{% for i in (1..10) %}{{ forloop.length }}{% break %}{% endfor %}'
      expect(await new Liquid({ templateLimit: 4 }).parseAndRender(early)).toBe('10')
      await expect(new Liquid({ templateLimit: 3 }).parseAndRender(early)).rejects.toThrow('Memory limits exceeded')
    })

    it('W05: table markup and captures are budgeted', async function () {
      await expect(
        new Liquid({ templateLimit: 3 }).parseAndRender('{% tablerow i in (1..3) %}{% endtablerow %}')
      ).rejects.toThrow('Memory limits exceeded')
      const capture = '{% capture table %}{% tablerow i in (1..2) %}{{ i }}{% endtablerow %}{% endcapture %}'
      await expect(new Liquid({ assignLimit: 69 }).parseAndRender(capture)).rejects.toThrow('Memory limits exceeded')
      expect(await new Liquid({ assignLimit: 70 }).parseAndRender(capture)).toBe('')
      const broken = '{% tablerow i in (1..3) %}{{ i }}{% break %}{% endtablerow %}'
      await expect(new Liquid({ outputLengthLimit: 46 }).parseAndRender(broken)).rejects.toThrow(
        'Memory limits exceeded'
      )
      expect(await new Liquid({ outputLengthLimit: 47 }).parseAndRender(broken)).toHaveLength(47)
    })

    it('W06: a cumulative budget spans isolated partials and repeated renders', async function () {
      const engine = new Liquid({ templates: { range_loop: '{% for i in (1..2) %}{% endfor %}' } })
      const src = "{% render 'range_loop' %}{% render 'range_loop' %}"
      await expect(
        engine.parseAndRender(src, {}, { ledger: new ResourceLedger({ templateLimit: 5 }) })
      ).rejects.toThrow('Memory limits exceeded')

      const templates = engine.parse(loop)
      const ledger = new ResourceLedger({ templateLimit: 14 })
      expect(await engine.render(templates, {}, { templateLimit: 7, ledger })).toBe('123')
      expect(await engine.render(templates, {}, { templateLimit: 7, ledger })).toBe('123')
      expect(ledger.template.used).toBe(14)
      await expect(engine.render(templates, {}, { templateLimit: 7, ledger })).rejects.toThrow('Memory limits exceeded')
      // without the ledger each render starts from zero
      expect(await engine.render(templates, {}, { templateLimit: 7 })).toBe('123')
      expect(await engine.render(templates, {}, { templateLimit: 7 })).toBe('123')
    })
  })

  describe('R5: assignment ledger', function () {
    const src = '{% assign a = s %}{% assign a = s %}{% assign a = s %}'
    const scope = { s: 'x'.repeat(15) }

    it('A01: reassignment does not refund the score', async function () {
      await expect(new Liquid({ assignLimit: 20 }).parseAndRender(src, scope)).rejects.toThrow('Memory limits exceeded')
      expect(await new Liquid({ assignLimit: 45 }).parseAndRender(src, scope)).toBe('')
      await expect(new Liquid({ assignLimit: 44 }).parseAndRender(src, scope)).rejects.toThrow('Memory limits exceeded')
    })

    it('A01: the score is reset for a fresh render but not by a shared ledger', async function () {
      const engine = new Liquid({ assignLimit: 45 })
      const templates = engine.parse(src)
      expect(await engine.render(templates, scope)).toBe('')
      expect(await engine.render(templates, scope)).toBe('')
      const ledger = new ResourceLedger({ assignLimit: 60 })
      expect(await engine.render(templates, scope, { ledger })).toBe('')
      await expect(engine.render(templates, scope, { ledger })).rejects.toThrow('Memory limits exceeded')
    })

    it('A02: releasing a binding does not release its score', async function () {
      const engine = new Liquid({ assignLimit: 20, templates: { p: '{% assign a = s %}' } })
      await expect(engine.parseAndRender("{% render 'p', s: s %}{% render 'p', s: s %}", scope)).rejects.toThrow(
        'Memory limits exceeded'
      )
      await expect(
        engine.parseAndRender('{% capture a %}{{ s }}{% endcapture %}{% assign a = "" %}{% assign b = s %}', scope)
      ).rejects.toThrow('Memory limits exceeded')
    })

    it('A02: an error inside a partial leaves the caller scope intact', async function () {
      const engine = new Liquid({ renderErrors: 'inline', templates: { boom: '{{ a }}{{ 1 | divided_by: 0 }}' } })
      expect(await engine.parseAndRender("{% assign a = 'caller' %}{% include 'boom' a: 1 %}{{ a }}")).toBe(
        '1Liquid error (boom line 1): divided by 0caller'
      )
    })
  })

  describe('R6: partial evaluation', function () {
    const engine = new Liquid({ templates: { t: '{{ a }}-{{ b }}', item: '[{{ item }}]', show: '{{ a }}' } })

    it('I01: include parameters see earlier parameters', async function () {
      expect(await engine.parseAndRender("{% include 't' a: 1, b: a %}")).toBe('1-1')
    })

    it('I02: render parameters stay independent', async function () {
      expect(await engine.parseAndRender("{% render 't' a: 1, b: a %}")).toBe('1-')
    })

    it('I03: include binds the variable named like the template', async function () {
      expect(await engine.parseAndRender("{% include 'item' %}", { item: ['a', 'b'] })).toBe('[a][b]')
      expect(await engine.parseAndRender("{% include 'item' %}", { item: 'x' })).toBe('[x]')
    })

    it('I03: include bindings do not outlive the tag', async function () {
      expect(await engine.parseAndRender("{% assign a = 'caller' %}{% include 'show' a: 1 %}{{ a }}")).toBe('1caller')
    })
  })

  describe('R7: numeric kind', function () {
    const cases: Array<[string, string]> = [
      ['{{ 7 | divided_by: "2.0" }}', '3.5'],
      ['{% assign n = 7.0 %}{{ n | divided_by: 2 }}', '3.5'],
      ['{{ 7.0 | plus: 0 | divided_by: 2 }}', '3.5'],
      ['{{ 7 | divided_by: 2 }}', '3'],
      ['{{ -7 | divided_by: 2 }}', '-4'],
      ['{{ -7.0 | divided_by: 2 }}', '-3.5'],
      ['{{ 6.0 | divided_by: 2 }}', '3.0'],
      ['{{ 7.0 }}', '7.0'],
      ['{% assign n = 7.0 %}{{ n }}', '7.0'],
      ['{{ 3.5 | times: 2 }}', '7.0'],
      ['{{ 1.5 | plus: 1.5 }}', '3.0'],
      ['{{ 1.0 | minus: 1 }}', '0.0'],
      ['{{ "2.5" | plus: "0.5" }}', '3.0'],
      ['{{ 7.0 | modulo: 2 }}', '1.0'],
      ['{{ 7 | divided_by: 0.0 }}', 'Infinity'],
      ['{{ -7 | divided_by: 0.0 }}', '-Infinity'],
      ['{{ "abc" | divided_by: 2 }}', '0'],
      ['{{ nil | plus: 1.0 }}', '1.0'],
      ['{{ 7.5 | round }}', '8'],
      ['{{ 7.0 | round: 1 }}', '7.0'],
      ['{{ 1.0 | abs }}', '1.0'],
      ['{{ 5 | at_least: 5.0 }}', '5'],
      ['{{ 10000000000000000.0 }}', '1.0e+16']
    ]

    it('keeps the decimal kind through literals, strings, assignments and filter chains', async function () {
      const engine = new Liquid()
      for (const [src, expected] of cases) {
        expect(await engine.parseAndRender(src), src).toBe(expected)
        expect(await engine.parseAndRender(src), src).toBe(expected)
      }
    })

    it('exposes nothing of the decimal representation', async function () {
      expect(
        await new Liquid().parseAndRender('{% assign n = 7.0 %}[{{ n.value }}{{ n.toString }}{{ n.toJSON }}]')
      ).toBe('[]')
    })

    it('keeps integer division by zero an error', async function () {
      await expect(new Liquid().parseAndRender('{{ 7 | divided_by: 0 }}')).rejects.toThrow('divided by 0')
    })

    it('reads a host Number by its value, the documented limitation', async function () {
      expect(await new Liquid().parseAndRender('{{ n | divided_by: 2 }}', { n: 7.0 })).toBe('3')
      expect(await new Liquid().parseAndRender('{{ n | divided_by: 2 }}', { n: 7.5 })).toBe('3.75')
    })
  })

  describe('engine options and numeric kinds', function () {
    it('a custom key-value separator survives lax and strict parsing', async function () {
      for (const errorMode of ['lax', 'strict'] as const) {
        const liquid = new Liquid({ errorMode, keyValueSeparator: '=', templates: { p: '[{{ a }}]' } })
        expect(await liquid.parseAndRender('{% for i in a limit=2 %}{{ i }}{% endfor %}', { a: [1, 2, 3] })).toBe('12')
        expect(await liquid.parseAndRender('{% include "p" a=1 %}')).toBe('[1]')
      }
    })
    it('a custom operator parses in strict mode', async function () {
      const operators = {
        ...new Liquid().options.operators,
        startsWith: (l: unknown, r: unknown) => String(l).startsWith(String(r))
      }
      const liquid = new Liquid({ errorMode: 'strict', operators })
      expect(await liquid.parseAndRender('{% if a startsWith "x" %}y{% endif %}', { a: 'xa' })).toBe('y')
    })
    it('size of a decimal-looking string counts its characters', async function () {
      expect(await new Liquid().parseAndRender('{{ "1.5" | size }}|{{ 1.5 | size }}')).toBe('3|0')
    })
    it('integers past 2**53 keep their value through every numeric filter', async function () {
      const liquid = new Liquid()
      expect(await liquid.parseAndRender('{{ 12345678901234567890 | modulo: 7 }}')).toBe('1')
      expect(
        await liquid.parseAndRender('{{ 12345678901234567890 | at_least: 1 }}|{{ 1 | at_most: 12345678901234567890 }}')
      ).toBe('12345678901234567890|1')
      expect(await liquid.parseAndRender('{{ 12345678901234567890 | ceil }}|{{ 12345678901234567890 | floor }}')).toBe(
        '12345678901234567890|12345678901234567890'
      )
      expect(await liquid.parseAndRender('{{ a | sum }}', { a: [9007199254740993n, 1] })).toBe('9007199254740994')
    })
  })
})
