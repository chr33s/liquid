import { Tokenizer } from '../parser'
import { Drop } from '../drop'
import { QuotedToken } from '../tokens'
import { Context } from '../context'
import { toPromise, toArray, toValue, LiquidRange } from '../util'
import { defaultOperators } from './operator'
import { defaultOptions } from '../liquid-options'
import { isFalsy } from './boolean'
import { evalQuotedToken } from './expression'

describe('Expression', function () {
  const ctx = new Context({})
  const create = (str: string) => new Tokenizer(str).readExpression()

  it('should throw when context not defined', async () => {
    await expect(toPromise(create('foo').evaluate(undefined!, false))).rejects.toThrow(/context not defined/)
  })

  describe('single value', function () {
    it('should eval literal', async function () {
      expect(await toPromise(create('2.4').evaluate(ctx, false))).toBe(2.4)
      expect(await toPromise(create('"foo"').evaluate(ctx, false))).toBe('foo')
      expect(await toPromise(create('false').evaluate(ctx, false))).toBe(false)
    })
    it('should eval literal', async function () {
      expect(await toPromise(create('2.4').evaluate(ctx, false))).toBe(2.4)
      expect(await toPromise(create('"foo"').evaluate(ctx, false))).toBe('foo')
      expect(await toPromise(create('false').evaluate(ctx, false))).toBe(false)
    })
    it('should support evalQuotedToken()', async function () {
      expect(evalQuotedToken(new QuotedToken('"foo"', 0, 5))).toBe('foo')
    })
    it('should eval property access', async function () {
      const ctx = new Context({
        foo: { bar: 'BAR' },
        coo: 'bar',
        doo: { foo: 'bar', bar: { foo: 'bar' } }
      })
      expect(await toPromise(create('foo.bar').evaluate(ctx, false))).toBe('BAR')
      expect(await toPromise(create('foo["bar"]').evaluate(ctx, false))).toBe('BAR')
      expect(await toPromise(create('foo[coo]').evaluate(ctx, false))).toBe('BAR')
      expect(await toPromise(create('foo[doo.foo]').evaluate(ctx, false))).toBe('BAR')
      expect(await toPromise(create('foo[doo["foo"]]').evaluate(ctx, false))).toBe('BAR')
      expect(await toPromise(create('doo[coo].foo').evaluate(ctx, false))).toBe('bar')
    })
    it('should support drops in property access', async function () {
      class TemplateDrop extends Drop {
        valueOf() {
          return 'bar'
        }
      }
      const ctx = new Context({
        foo: { bar: 'BAR' },
        coo: new TemplateDrop()
      })
      expect(await toPromise(create('foo[coo]').evaluate(ctx, false))).toBe('BAR')
    })
  })

  describe('simple expression', function () {
    it('should return false for "1==2"', async () => {
      expect(await toPromise(create('1==2').evaluate(ctx, false))).toBe(false)
    })
    it('should apply deep equal for arrays', async () => {
      const ctx = new Context({
        arr1: [1, 2],
        arr2: [1, 2],
        arr3: [1, 2, 3]
      })
      expect(await toPromise(create('arr1==arr2').evaluate(ctx, false))).toBe(true)
      expect(await toPromise(create('arr1==arr3').evaluate(ctx, false))).toBe(false)
    })
    it('should return true for "1<2"', async () => {
      expect(await toPromise(create('1<2').evaluate(ctx, false))).toBe(true)
    })
    it('should return true for "1 < 2"', async () => {
      expect(await toPromise(create('1 < 2').evaluate(ctx, false))).toBe(true)
    })
    it('should return true for "1   <   2"', async () => {
      expect(await toPromise(create('1   <   2').evaluate(ctx, false))).toBe(true)
    })
    it('should return true for "2 <= 2"', async () => {
      expect(await toPromise(create('2 <= 2').evaluate(ctx, false))).toBe(true)
    })
    it('should return true for "one <= two"', async () => {
      const ctx = new Context({ one: 1, two: 2 })
      expect(await toPromise(create('one <= two').evaluate(ctx, false))).toBe(true)
    })
    it('should return false for "x contains "x""', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('x contains "x"').evaluate(ctx, false))).toBe(false)
    })
    it('should return true for "x contains "X""', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('x contains "X"').evaluate(ctx, false))).toBe(true)
    })
    it('should return false for "1 contains "x""', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('1 contains "x"').evaluate(ctx, false))).toBe(false)
    })
    it('should return false for "y contains "x""', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('y contains "x"').evaluate(ctx, false))).toBe(false)
    })
    it('should return false for "z contains "x""', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('z contains "x"').evaluate(ctx, false))).toBe(false)
    })
    it('should return true for "(1..5) contains 3"', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('(1..5) contains 3').evaluate(ctx, false))).toBe(true)
    })
    it('should return false for "(1..5) contains 6"', async () => {
      const ctx = new Context({ x: 'XXX' })
      expect(await toPromise(create('(1..5) contains 6').evaluate(ctx, false))).toBe(false)
    })
    it('should return true for ""<=" == "<=""', async () => {
      expect(await toPromise(create('"<=" == "<="').evaluate(ctx, false))).toBe(true)
    })
  })

  it('should allow space in quoted value', async function () {
    const ctx = new Context({ space: ' ' })
    expect(await toPromise(create('" " == space').evaluate(ctx, false))).toBe(true)
  })

  describe('escape', () => {
    it('should read a string literal without escapes, as the reference', async function () {
      const ctx = new Context({ quote: '"', slash: '\\n' })
      expect(await toPromise(create(`'"' == quote`).evaluate(ctx, false))).toBe(true)
      expect(await toPromise(create('"\\n" == slash').evaluate(ctx, false))).toBe(true)
    })
    it('should escape square bracket', async function () {
      const ctx = new Context({ obj: { ']': 'bracket' } })
      expect(await toPromise(create('obj["]"] == "bracket"').evaluate(ctx, false))).toBe(true)
    })
  })

  describe('complex expression', function () {
    it('should support value or value', async function () {
      expect(await toPromise(create('false or true').evaluate(ctx, false))).toBe(true)
    })
    it('should support < and contains', async function () {
      expect(await toPromise(create('1 < 2 and x contains "x"').evaluate(ctx, false))).toBe(false)
    })
    it('should support < or contains', async function () {
      expect(await toPromise(create('1 < 2 or x contains "x"').evaluate(ctx, false))).toBe(true)
    })
    it('should support Drops for "x contains "x""', async () => {
      class TemplateDrop extends Drop {
        valueOf() {
          return 'X'
        }
      }
      const ctx = new Context({ x: 'XXX', X: new TemplateDrop() })
      expect(await toPromise(create('x contains X').evaluate(ctx, false))).toBe(true)
    })
    it('should support Drops for "x contains "x"" when x is an array', async () => {
      class TemplateDrop extends Drop {
        valueOf() {
          return 'X'
        }
      }
      const ctx = new Context({ x: [new TemplateDrop()], X: 'X' })
      expect(await toPromise(create('x contains X').evaluate(ctx, false))).toBe(true)
    })
    it('should support Drops for "x contains "x"" when x is an array on both operands', async () => {
      class TemplateDrop extends Drop {
        valueOf() {
          return 'X'
        }
      }
      const ctx = new Context({ x: [new TemplateDrop()], X: new TemplateDrop() })
      expect(await toPromise(create('x contains X').evaluate(ctx, false))).toBe(true)
    })
    it('should support value and !=', async function () {
      const ctx = new Context({ empty: '' })
      expect(await toPromise(create('empty and empty != ""').evaluate(ctx, false))).toBe(false)
    })
    it('should recognize quoted value', async function () {
      expect(await toPromise(create('">"').evaluate(ctx, false))).toBe('>')
    })
    it('should evaluate from right to left', async function () {
      expect(await toPromise(create('true or false and false').evaluate(ctx, false))).toBe(true)
      expect(await toPromise(create('true and false and false or true').evaluate(ctx, false))).toBe(false)
    })
    it('should recognize property access', async function () {
      const ctx = new Context({ obj: { foo: true } })
      expect(await toPromise(create('obj["foo"] and true').evaluate(ctx, false))).toBe(true)
    })
    it('should allow nested property access', async function () {
      const ctx = new Context({ obj: { foo: 'FOO' }, keys: { "what's this": 'foo' } })
      expect(await toPromise(create('obj[keys["what\'s this"]]').evaluate(ctx, false))).toBe('FOO')
    })
    it('should allow bracket quoted property access', async function () {
      const ctx = new Context({ 'foo bar': { coo: 'FOO BAR' } })
      expect(await toPromise(create('["foo bar"].coo').evaluate(ctx, false))).toBe('FOO BAR')
    })
    it('should not register a unary not by default', async function () {
      expect(await toPromise(create('not 1 < 2').evaluate(ctx))).toBe(undefined)
    })
    it('should support a registered unary not', async function () {
      const operators = { ...defaultOperators, not: (v: any, c: Context) => isFalsy(toValue(v), c) }
      const notCtx = new Context({}, { ...defaultOptions, operators })
      const withNot = (str: string) => new Tokenizer(str, operators).readExpression()
      expect(await toPromise(withNot('not 1 < 2').evaluate(notCtx))).toBe(false)
      expect(await toPromise(withNot('not 1 < 2 or not 1 > 2').evaluate(notCtx))).toBe(true)
      expect(await toPromise(withNot('not 1 < 2 and not 1 > 2').evaluate(notCtx))).toBe(false)
    })
    it('should allow variable as squared sub property key', async function () {
      const ctx = new Context({ foo: { bar: 'BAR' }, key: 'bar' })
      expect(await toPromise(create('foo[key]').evaluate(ctx))).toBe('BAR')
    })
    it('should allow propertyAccessToken  as squared sub property key', async function () {
      const ctx = new Context({ foo: { bar: 'BAR', key: 'bar' } })
      expect(await toPromise(create('foo[foo.key]').evaluate(ctx))).toBe('BAR')
    })
    it('should allow nested squared property read', async function () {
      const ctx = new Context({ foo: { bar: 'BAR', key: 'bar' } })
      expect(await toPromise(create('foo[foo["key"]]').evaluate(ctx))).toBe('BAR')
    })
    it('should not index a string, as in the reference', async function () {
      expect(await toPromise(create('"foo"[2]').evaluate(ctx))).toBeUndefined()
    })
    it('should allow range as property read variable', async function () {
      expect(await toPromise(create('(3..5).size').evaluate(ctx))).toBe(3)
    })
  })

  describe('range', function () {
    const ctx = new Context({ two: 2, num: { one: 1, two: 2 } })
    const items = async (src: string) => toArray(await toPromise(create(src).evaluate(ctx, false)))
    it('should eval range expression', async function () {
      expect(await items('(2..4)')).toEqual([2, 3, 4])
      expect(await items('(two..4)')).toEqual([2, 3, 4])
    })
    it('should allow property access expression as variables', async function () {
      expect(await items('(num.one..num.two)')).toEqual([1, 2])
      expect(await items('(num.one .. two)')).toEqual([1, 2])
    })
    it('should allow blanks in range', async function () {
      expect(await items('(3 ..5)')).toEqual([3, 4, 5])
      expect(await items('(3 .. 5)')).toEqual([3, 4, 5])
      expect(await items('( 3 .. 5 )')).toEqual([3, 4, 5])
    })
    it('should not materialize a huge range', async function () {
      const range = (await toPromise(create('(1..100000000000)').evaluate(ctx, false))) as LiquidRange
      expect(range.length).toBe(100000000000)
      expect([...range.slice(0, 3)]).toEqual([1, 2, 3])
    })
    it('should throw if .. not matched', async function () {
      expect(() => create('(3.5')).toThrow('invalid range syntax')
      expect(() => create('(3 5')).toThrow('invalid range syntax')
    })
    it('should throw if ( not patched', async function () {
      expect(() => create('(3..5')).toThrow('invalid range syntax')
    })
  })

  describe('sync', function () {
    it('should eval literal', async function () {
      expect(await toPromise(create('2.4').evaluate(ctx, false))).toBe(2.4)
    })
    it('should return false for "1==2"', async () => {
      expect(await toPromise(create('1==2').evaluate(ctx, false))).toBe(false)
    })
    it('should read a string literal without escapes', async function () {
      const ctx = new Context({ quote: '"' })
      expect(await toPromise(create(`'"' == quote`).evaluate(ctx, false))).toBe(true)
    })
    it('should allow nested property access', async function () {
      const ctx = new Context({ obj: { foo: 'FOO' }, keys: { "what's this": 'foo' } })
      expect(await toPromise(create('obj[keys["what\'s this"]]').evaluate(ctx, false))).toBe('FOO')
    })
  })
})
