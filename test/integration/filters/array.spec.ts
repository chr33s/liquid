import { test, render } from '../../stub/render'
import { Liquid } from '../../../src/liquid'

/** `json` belongs to the hosted dialect. */
const HOSTED = { profile: 'shopify_theme' } as const

describe('filters/array', function () {
  const engine = new Liquid()
  describe('index', function () {
    it('should support index', function () {
      const src = '{% assign beatles = "John, Paul, George, Ringo" | split: ", " %}' + '{{ beatles[1] }}'
      return test(src, 'Paul')
    })
  })
  describe('join', function () {
    it('should support join', function () {
      const src = '{% assign beatles = "John, Paul, George, Ringo" | split: ", " %}' + '{{ beatles | join: " and " }}'
      return test(src, 'John and Paul and George and Ringo')
    })
    it('should default separator to space', function () {
      const src = '{% assign beatles = "John, Paul, George, Ringo" | split: ", " %}' + '{{ beatles | join }}'
      return test(src, 'John Paul George Ringo')
    })
    it('should throw when comma missing', async () => {
      const src = '{% assign beatles = "John, Paul, George, Ringo" | split: ", " %}' + '{{ beatles | join " and " }}'
      return expect(new Liquid({ errorMode: 'warn' }).parseAndRender(src)).rejects.toThrow(
        'expected ":" after filter name, line:1, col:83'
      )
    })
  })
  describe('split', () => {
    it('should support split', function () {
      const src = '{% assign my_array = "zebra, octopus, giraffe, tiger" | split: ", " %}' + '{{ my_array|last }}'
      return test(src, 'tiger')
    })
    it('should remove trailing empty strings', async () => {
      const src = '{{ "zebra,octopus,,,," | split: "," | join: ", " }}'
      return test(src, {}, 'zebra, octopus')
    })
    it('should return empty array for nil value', async () => {
      await test('{{ notDefined | split: "," | size }}', {}, '0')
      await test('{{ nil | split: "," | size }}', {}, '0')
    })
  })
  describe('map', () => {
    it('should support map', function () {
      const posts = [{ category: 'foo' }, { category: 'bar' }]
      return test('{{posts | map: "category"}}', { posts }, 'foobar')
    })
    it('should normalize non-array input', function () {
      const post = { category: 'foo' }
      return test('{{post | map: "category"}}', { post }, 'foo')
    })
    it('should allow nil results in strictVariables mode', async function () {
      const engine = new Liquid({ strictVariables: true, profile: 'shopify_theme' })
      const ctx = {
        posts: [{ category: 'foo' }, { title: 'bar' }]
      }
      const result = await engine.parseAndRender('{{posts | map: "category" | json}}', ctx)
      expect(result).toEqual('["foo",null]')
    })
    it('F04: should treat a dotted property as a literal key', function () {
      const tpl = '{{ arr | map: "name.first" | join }}'
      const a = { 'name.first': 'Alice', name: { first: 'nope' } }
      const b = { 'name.first': 'Bob' }
      return test(tpl, { arr: [a, b] }, 'Alice Bob')
    })
    it('F07: should flatten nested arrays', function () {
      return test('{{ arr | map: "a" | join: "," }}', { arr: [[{ a: 1 }], [[{ a: 2 }]]] }, '1,2')
    })
  })
  describe('sum', () => {
    it('should support sum with no args', function () {
      const ages = [21, null, -4, '4.5', 13.25, undefined, 0]
      return test('{{ages | sum}}', { ages }, '34.75')
    })
    it('should support sum with property', function () {
      const ages = [21, null, -4, '4.5', 13.25, undefined, 0].map(x => ({ age: x }))
      return test('{{ages | sum: "age"}}', { ages }, '34.75')
    })
    it('F04: should treat a dotted sum property as a literal key', function () {
      const ages = [21, null, -4, '4.5', 13.25, undefined, 0].map(x => ({ 'age.first': x }))
      return test('{{ages | sum: "age.first"}}', { ages }, '34.75')
    })
    it('should support non-array input', function () {
      const age = 21.5
      return test('{{age | sum}}', { age }, '21.5')
    })
    it('should coerce missing property to zero', function () {
      const ages = [{ qty: 1 }, { qty: 2, cnt: 3 }, { cnt: 4 }]
      return test('{{ages | sum}} {{ages | sum: "cnt"}} {{ages | sum: "other"}}', { ages }, '0 7 0')
    })
    it('should coerce indexable non-map values to zero', function () {
      const input = [1, 'foo', { quantity: 3 }]
      return test('{{input | sum}}', { input }, '1')
    })
    it('should coerce unindexable values to zero', function () {
      const input = [1, null, { quantity: 2 }]
      return test('{{input | sum}}', { input }, '1')
    })
    it('should read a non-numeric item as 0, as the reference', function () {
      const input = [1, true, null, { quantity: 2 }]
      return test('{{input | sum}}', { input }, '1')
    })
    it('F07: should flatten nested arrays', function () {
      const ages = [1, [2, [3, 4]]]
      return test('{{ages | sum}}', { ages }, '10')
    })
  })
  describe('compact', () => {
    it('should compact array', function () {
      const posts = [{ category: 'foo' }, { category: 'bar' }, { foo: 'bar' }]
      return test('{{posts | map: "category" | compact}}', { posts }, 'foobar')
    })
  })
  describe('concat', () => {
    it('should concat args value', async () => {
      const scope = { val: ['hey'], arr: ['foo', 'bar'] }
      await test('{{ val | concat: arr | join: "," }}', scope, 'hey,foo,bar')
    })
    it('should support undefined left value', async () => {
      const scope = { arr: ['foo', 'bar'] }
      await test('{{ notDefined | concat: arr | join: "," }}', scope, 'foo,bar')
    })
    it('should ignore nil left value', async () => {
      const scope = { undefinedValue: undefined, nullValue: null, arr: ['foo', 'bar'] }
      await test('{{ undefinedValue | concat: arr | join: "," }}', scope, 'foo,bar')
      await test('{{ nullValue | concat: arr | join: "," }}', scope, 'foo,bar')
    })
    it('F11: should reject a non-array right value', async () => {
      const engine = new Liquid()
      await expect(engine.parseAndRender('{{ arr | concat: nil }}', { arr: [1] })).rejects.toThrow(
        'concat filter requires an array argument'
      )
      await expect(engine.parseAndRender('{{ arr | concat: "x" }}', { arr: [1] })).rejects.toThrow(
        'concat filter requires an array argument'
      )
    })
  })
  describe('reverse', function () {
    it('should support reverse', () =>
      test('{{ "Ground control to Major Tom." | split: "" | reverse | join: "" }}', '.moT rojaM ot lortnoc dnuorG'))
    it('should be pure', async () => {
      const scope = { arr: ['a', 'b', 'c'] }
      await render('{{ arr | reverse | join: "" }}', scope)
      const html = await render('{{ arr | join: "" }}', scope)
      expect(html).toBe('abc')
    })
  })
  describe('size', function () {
    it('should return string length', () => test('{{ "Ground control to Major Tom." | size }}', '28'))
    it('should return array size', () =>
      test('{% assign my_array = "apples, oranges, peaches, plums" | split: ", " %}{{ my_array | size }}', '4'))
    it('should be respected with <string>.size notation', () =>
      test('{% assign my_string = "Ground control to Major Tom." %}{{ my_string.size }}', '28'))
    it('should be respected with <array>.size notation', () =>
      test('{% assign my_array = "apples, oranges, peaches, plums" | split: ", " %}{{ my_array.size }}', '4'))
    it('should return 0 for false', () => test('{{ false | size }}', '0'))
    it('should return 0 for nil', () => test('{{ nil | size }}', '0'))
    it('should return 0 for undefined', () => test('{{ foo | size }}', '0'))
    it('should work for string', () => test('{{ "foo" | size }}', {}, '3'))
  })
  describe('first', function () {
    it('should support first', () => test('{{arr | first}}', { arr: ['zebra', 'tiger'] }, 'zebra'))
    it('should return empty for nil', () => test('{{nil | first}}', ''))
    it('should return empty for undefined', () => test('{{foo | first}}', ''))
    it('should return empty for false', () => test('{{false | first}}', ''))
    it('should work for string', () => test('{{ "foo" | first }}', 'f'))
  })
  describe('last', function () {
    it('should support last', () => test('{{arr | last}}', { arr: ['zebra', 'tiger'] }, 'tiger'))
    it('should return empty for nil', () => test('{{nil | last}}', ''))
    it('should return empty for undefined', () => test('{{foo | last}}', ''))
    it('should return empty for false', () => test('{{false | last}}', ''))
    it('should work for string', () => test('{{ "foo" | last }}', {}, 'o'))
  })
  describe('slice', function () {
    it('should slice first char by 0', () => test('{{ "Liquid" | slice: 0 }}', 'L'))
    it('should slice third char by 2', () => test('{{ "Liquid" | slice: 2 }}', 'q'))
    it('should slice substr by 2,5', () => test('{{ "Liquid" | slice: 2, 5 }}', 'quid'))
    it('should slice substr by -3,2', () => test('{{ "Liquid" | slice: -3, 2 }}', 'ui'))
    it('should slice substr by -2,2', () => test('{{ "abc" | slice: -2, 2 }}', 'bc'))
    it('should support array', () => test('{{ "1,2,3,4" | split: "," | slice: 1,2 | join }}', '2 3'))
    it('should return empty array for nil value', () => test('{{ nil | slice: 0 }}', ''))
    it('should return empty when begin is out of negative range', () => test('{{ "hello" | slice: -10, 2 }}', ''))
    it('should return empty when length is negative', () => test('{{ "Liquid" | slice: 1, -2 }}', ''))
    it('should return empty array when begin is out of negative range', () =>
      test('{{ "1,2,3,4,5" | split: "," | slice: -10, 2 | join: "," }}', ''))
  })
  describe('sort', function () {
    it('should support sort', function () {
      return test(
        '{% assign my_array = "zebra, octopus, giraffe, Sally Snake"' +
          ' | split: ", " %}' +
          '{{ my_array | sort | join: ", " }}',
        'Sally Snake, giraffe, octopus, zebra'
      )
    })
    it('should support sort by key', function () {
      const tpl = '{{ arr | sort: "name" | map: "name" | join }}'
      const arr = [{ name: 'Bob' }, { name: 'Carol' }, { name: 'Alice' }]
      return test(tpl, { arr }, 'Alice Bob Carol')
    })
    it('F04: should sort by a literal dotted key', function () {
      const tpl = '{{ arr | sort: "name.first" | map: "name.first" | join }}'
      const a = { 'name.first': 'Alice' }
      const b = { 'name.first': 'Bob' }
      const c = { 'name.first': 'Carol' }
      return test(tpl, { arr: [b, c, a, c] }, 'Alice Bob Carol Carol')
    })
    it('should not change the original array', () => {
      const arr = ['one', 'two', 'three', 'four', 'five']
      return test('{{arr | sort}} {{arr}}', { arr }, 'fivefouronethreetwo onetwothreefourfive')
    })
    it('should return empty array for nil value', () => {
      return test('{{notDefined | sort | size}}', {}, '0')
    })
    it('should respect ownPropertyOnly', async () => {
      const engine = new Liquid({ ownPropertyOnly: true })
      const a = Object.create({ secret: 'ccc' })
      a.name = 'a'
      const b = Object.create({ secret: 'aaa' })
      b.name = 'b'
      const html = await engine.parseAndRender('{{ arr | sort: "secret" | map: "name" | join: "," }}', { arr: [a, b] })
      expect(html).toBe('a,b')
    })
    it('should handle nil property values', async () => {
      const arr = [{ age: 'cc' }, { name: 'x' }, { age: 'aa' }, { age: 'bb' }]
      await test(
        '{% assign sorted = arr | sort: "age" %}{% for item in sorted %}[{{ item.age }}]{% endfor %}',
        { arr },
        '[aa][bb][cc][]'
      )
    })
    it('should reject mixed-type items, as in the reference', async () => {
      const arr = ['40', null, 30, undefined, true, false, 0, 'str', 50]
      await expect(render('{% assign sorted = arr | sort %}', { arr })).rejects.toThrow(
        'cannot sort values of incompatible types'
      )
      await test('{{ arr | sort | join: "," }}', { arr: [3, null, 1.5, 2] }, '1.5,2,3,')
    })
  })
  describe('sort_natural', function () {
    it('should sort alphabetically', () => {
      return test(
        '{% assign my_array = "zebra, octopus, giraffe, Sally Snake" | split: ", " %}{{ my_array | sort_natural | join: ", " }}',
        'giraffe, octopus, Sally Snake, zebra'
      )
    })
    it('should sort with specified property', () =>
      test(
        '{{ students | sort_natural: "name" | map: "name" | join }}',
        { students: [{ name: 'bob' }, { name: 'alice' }, { name: 'carol' }] },
        'alice bob carol'
      ))
    it('should be stable', () =>
      test(
        '{{ students | sort_natural: "age" | map: "name" | join }}',
        {
          students: [
            { name: 'bob', age: 1 },
            { name: 'alice', age: 1 },
            { name: 'carol', age: 1 }
          ]
        },
        'bob alice carol'
      ))
    it('should be stable when it comes to undefined props', () =>
      test(
        '{{ students | sort_natural: "age" | map: "name" | join }}',
        {
          students: [
            { name: 'bob' },
            { name: 'alice', age: 2 },
            { name: 'amber' },
            { name: 'watson' },
            { name: 'michael' },
            { name: 'charlie' }
          ]
        },
        'alice bob amber watson michael charlie'
      ))
    it('should tolerate undefined props', () =>
      test(
        '{{ students | sort_natural: "age" | map: "name" | join }}',
        { students: [{ name: 'bob' }, { name: 'alice', age: 2 }, { name: 'carol' }] },
        'alice bob carol'
      ))
    it('should tolerate non array', async () => {
      await test('{{ students | sort_natural: "age" | map: "name" | join }}', { students: {} }, '')
      await test('{{ students | sort_natural: "age" | map: "name" | size }}', { students: {} }, '1')
    })
    it('should return empty array for nil value', () =>
      test('{{ students | sort_natural: "age" | map: "name" | size }}', { students: undefined }, '0'))
    it('should respect ownPropertyOnly', async () => {
      const engine = new Liquid({ ownPropertyOnly: true })
      const target = Object.create({ secret: 'bbb' })
      const html = await engine.parseAndRender('{{ arr | sort_natural: "secret" | map: "secret" | join: "," }}', {
        arr: [{ secret: 'ccc' }, target, { secret: 'aaa' }]
      })
      expect(html).toBe('aaa,ccc,')
    })
    it('should handle nil property values', async () => {
      const arr = [{ age: '40' }, { name: 'x' }, { age: 30 }, { age: 50 }]
      await test(
        '{% assign sorted = arr | sort_natural: "age" %}{% for item in sorted %}[{{ item.age }}]{% endfor %}',
        { arr },
        '[30][40][50][]'
      )
    })
    it('should handle mixed-type items', async () => {
      const arr = ['40', null, 30, undefined, true, false, 0, 'str', 50]
      await test(
        '{% assign sorted = arr | sort_natural %}{% for item in sorted %}[{{ item }}]{% endfor %}',
        { arr },
        '[0][30][40][50][false][str][true][][]'
      )
    })
  })
  describe('uniq', function () {
    it('should uniq string list', function () {
      return test(
        '{% assign my_array = "ants, bugs, bees, bugs, ants" | split: ", " %}' + '{{ my_array | uniq | join: ", " }}',
        'ants, bugs, bees'
      )
    })
    it('should uniq falsy value', function () {
      return test('{{"" | uniq | join: ","}}', '')
    })
  })
  describe('where', function () {
    const products = [
      { title: 'Vacuum', type: 'living room' },
      { title: 'Spatula', type: 'kitchen' },
      { title: 'Television', type: 'living room' },
      { title: 'Garlic press', type: 'kitchen' },
      { title: 'Coffee mug', available: true },
      { title: 'Limited edition sneakers', available: false },
      { title: 'Boring sneakers', available: true }
    ]
    it('should support filter by property value', function () {
      return test(
        `{% assign kitchen_products = products | where: "type", "kitchen" %}
        Kitchen products:
        {% for product in kitchen_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Kitchen products:
        - Spatula
        - Garlic press
        `
      )
    })
    it('should support filter truthy property', function () {
      return test(
        `{% assign available_products = products | where: "available" %}
        Available products:
        {% for product in available_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Available products:
        - Coffee mug
        - Boring sneakers
        `
      )
    })
    it('a null target selects by truthiness, as the reference does', function () {
      return test(
        `{% assign typed_products = products | where: "type", null %}
        Typed products:
        {% for product in typed_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Typed products:
        - Vacuum
        - Spatula
        - Television
        - Garlic press
        `
      )
    })
    it('should support filter with undefined target', function () {
      return test(
        `{% assign typed_products = products | where: "type", notdefined %}
        Typed products:
        {% for product in typed_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Typed products:
        - Vacuum
        - Spatula
        - Television
        - Garlic press
        `
      )
    })
    it('should support no target', function () {
      return test(
        `{% assign typed_products = products | where: "type" %}
        Typed products:
        {% for product in typed_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Typed products:
        - Vacuum
        - Spatula
        - Television
        - Garlic press
        `
      )
    })
    it('F04: should treat a dotted property as a literal key', async function () {
      const authors = [
        { name: 'Alice', 'books.year': 2019, books: { year: 1900 } },
        { name: 'Bob', 'books.year': 2018 }
      ]
      return test(
        `{% assign recentAuthors = authors | where: 'books.year', 2019 %}
        Recent Authors:
        {%- for author in recentAuthors %}
          - {{author.name}}
        {%- endfor %}`,
        { authors },
        `
        Recent Authors:
          - Alice`
      )
    })
    it('should apply to string', async () => {
      await test('{{"abc" | where: 1, "b" }}', 'abc')
      await test('{{"abc" | where: 1, "a" }}', '')
    })
    it('should normalize non-array input', async () => {
      const scope = { obj: { foo: 'FOO' } }
      await test('{{obj | where: "foo", "FOO" }}', scope, '{"foo"=>"FOO"}')
      await test('{{obj | where: "foo", "BAR" }}', scope, '')
    })
    it('F04: a bracketed path is a literal key too', function () {
      const products = [
        { 'meta.details["class"]': 'A', order: 1 },
        { 'meta.details["class"]': 'B', order: 2 },
        { 'meta.details["class"]': 'B', order: 3 }
      ]
      return test(
        `{% assign selected = products | where: 'meta.details["class"]', exp %}
        {% for item in selected -%}
        - {{ item.order }}
        {% endfor %}`,
        { products, exp: 'B' },
        `
        - 2
        - 3
        `
      )
    })
    it('F12: should reject a missing property argument', function () {
      return expect(render('{{ products | where }}', { products: [] })).rejects.toThrow(
        'wrong number of arguments (given 1, expected 2..3)'
      )
    })
    it('should support nil as target', () => {
      const scope = { list: [{ foo: 'FOO' }, { bar: 'BAR', type: 2 }] }
      return test('{{list | where: "type", nil | json}}', scope, '[{"bar":"BAR","type":2}]', HOSTED)
    })
    it('should support empty as target', async () => {
      const scope = { pages: [{ tags: ['FOO'] }, { tags: [] }, { title: 'foo' }] }
      await test('{{pages | where: "tags", empty | json}}', scope, '[{"tags":[]}]', HOSTED)
    })
    it('should not match string with array', async () => {
      const scope = { objs: [{ foo: ['FOO', 'bar'] }] }
      await test('{{objs | where: "foo", "FOO" | json}}', scope, '[]', HOSTED)
    })
  })
  describe('reject', function () {
    const products = [
      { title: 'Vacuum', type: 'living room' },
      { title: 'Spatula', type: 'kitchen' },
      { title: 'Television', type: 'living room' },
      { title: 'Garlic press', type: 'kitchen' },
      { title: 'Coffee mug', available: true },
      { title: 'Limited edition sneakers', available: false },
      { title: 'Boring sneakers', available: true }
    ]
    it('should support reject by property value', function () {
      return test(
        `{% assign kitchen_products = products | reject: "type", "kitchen" %}
        Kitchen products:
        {% for product in kitchen_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Kitchen products:
        - Vacuum
        - Television
        - Coffee mug
        - Limited edition sneakers
        - Boring sneakers
        `
      )
    })
    it('should support reject truthy property', function () {
      return test(
        `{% assign unavailable_products = products | reject: "available" %}
        Unavailable products:
        {% for product in unavailable_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Unavailable products:
        - Vacuum
        - Spatula
        - Television
        - Garlic press
        - Limited edition sneakers
        `
      )
    })
    it('should support reject by string property', function () {
      return test(
        `{% assign untyped_products = products | reject: "type" %}
        Untyped products:
        {% for product in untyped_products -%}
        - {{ product.title }}
        {% endfor %}`,
        { products },
        `
        Untyped products:
        - Coffee mug
        - Limited edition sneakers
        - Boring sneakers
        `
      )
    })
  })
  describe('has', function () {
    const members = [
      { graduation_year: 2013, name: 'Jay' },
      { graduation_year: 2014, name: 'John' },
      { graduation_year: 2014, name: 'Jack', age: 13 }
    ]
    it('should support has with no value', function () {
      return test(`{{ members | has: "age" | json }}, {{ members | has: "height" | json }}`, { members }, `true, false`)
    })
    it('should support has by property', function () {
      return test(`{{ members | has: "graduation_year", 2014 | json }}`, { members }, `true`)
    })
    it('should return false if not found', function () {
      return test(`{{ members | has: "graduation_year", 2018 | json }}`, { members }, `false`)
    })
  })
  describe('find', function () {
    const members = [
      { graduation_year: 2013, name: 'Jay' },
      { graduation_year: 2014, name: 'John' },
      { graduation_year: 2014, name: 'Jack', age: 13 }
    ]
    it('should support find with no value', function () {
      return test(
        `{{ members | find: "age" | json }}`,
        { members },
        `{"graduation_year":2014,"name":"Jack","age":13}`,
        HOSTED
      )
    })
    it('should support find by property', function () {
      return test(
        `{{ members | find: "graduation_year", 2014 | json }}`,
        { members },
        `{"graduation_year":2014,"name":"John"}`,
        HOSTED
      )
    })
    it('should render none if not found', function () {
      return test(`{{ members | find: "graduation_year", 2018 | json }}`, { members }, ``)
    })
  })
  describe('find_index', function () {
    const members = [
      { graduation_year: 2013, name: 'Jay' },
      { graduation_year: 2014, name: 'John' },
      { graduation_year: 2014, name: 'Jack', age: 13 }
    ]
    it('should support find_index with no value', function () {
      return test(`{{ members | find_index: "age" | json }}`, { members }, `2`)
    })
    it('should support find_index by property', function () {
      return test(`{{ members | find_index: "graduation_year", 2014 | json }}`, { members }, `1`)
    })
    it('should render none if not found', function () {
      return test(`{{ members | find_index: "graduation_year", 2018 | json }}`, { members }, ``)
    })
  })
})
