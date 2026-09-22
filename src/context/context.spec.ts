import { Context } from './context'
import { Scope } from './scope'
describe('Context', function () {
  let ctx: any, scope: Scope
  beforeEach(function () {
    scope = {
      foo: 'zoo',
      one: 1,
      zoo: { size: 4 },
      map: new Map([['foo', 'FOO']]),
      obj: {
        first: 'f',
        last: 'l'
      },
      func: () => 'FUNC',
      objFunc: () => ({ prop: 'PROP' }),
      bar: {
        zoo: 'coo',
        'Mr.Smith': 'John',
        arr: ['a', 'b']
      },
      arr: ['a', 'b', 'c', 'd']
    }
    ctx = new Context(scope)
  })
  describe('#get()', function () {
    it('should get direct property', async function () {
      expect(await ctx.get(['foo'])).toEqual('zoo')
    })
    it('should read nested property', async function () {
      expect(await ctx.get(['obj', 'first'])).toEqual('f')
      expect(await ctx.get(['obj', 'last'])).toEqual('l')
      expect(await ctx.get(['obj', 'size'])).toEqual(2)
    })
    it('undefined property should yield undefined', async function () {
      expect(await ctx.get(['notdefined'])).toEqual(undefined)
      expect(await ctx.get([false as any])).toEqual(undefined)
    })
    it('should respect to toLiquid', async function () {
      const scope = new Context({
        foo: {
          toLiquid: () => ({ bar: 'BAR' }),
          bar: 'bar'
        }
      })
      // eslint-disable-next-line deprecation/deprecation
      expect(await scope.get(['foo', 'bar'])).toEqual('BAR')
    })
    it('should return undefined when not exist', async function () {
      expect(await ctx.get(['foo', 'foo', 'foo'])).toBeUndefined()
    })
    it('should return string length as size', async function () {
      expect(await ctx.get(['foo', 'size'])).toEqual(3)
    })
    it('should return array length as size', async function () {
      expect(await ctx.get(['bar', 'arr', 'size'])).toEqual(2)
    })
    it('should return map size as size', async function () {
      expect(await ctx.get(['map', 'size'])).toEqual(1)
    })
    it('should return own size property', async function () {
      expect(await ctx.get(['zoo', 'size'])).toEqual(4)
    })
    it('should return undefined if not have a size', async function () {
      expect(await ctx.get(['one', 'size'])).toBeUndefined()
      expect(await ctx.get(['non-exist', 'size'])).toBeUndefined()
    })
    it('should read .first of array', async function () {
      expect(await ctx.get(['bar', 'arr', 'first'])).toEqual('a')
    })
    it('should read .last of array', async function () {
      expect(await ctx.get(['bar', 'arr', 'last'])).toEqual('b')
    })
    it('should read element of array', async function () {
      expect(await ctx.get(['arr', 1])).toEqual('b')
    })
    it('should read element of array from end', async function () {
      expect(await ctx.get(['arr', -2])).toEqual('c')
    })
    it('should call function', async function () {
      expect(await ctx.get(['func'])).toEqual('FUNC')
    })
    it('should call function before read nested property', async function () {
      expect(await ctx.get(['objFunc', 'prop'])).toEqual('PROP')
    })
  })
  describe('#getFromScope()', function () {
    it('should support string', async () => {
      expect(await ctx.getFromScope({ obj: { foo: 'FOO' } }, 'obj.foo')).toEqual('FOO')
    })
  })
  describe('strictVariables', function () {
    let ctx: Context
    beforeEach(function () {
      ctx = new Context(ctx, {
        strictVariables: true
      } as any)
    })
    it('should throw when variable not defined', async function () {
      return await expect(async () => await ctx.get(['notdefined'])).rejects.toThrow(/undefined variable: notdefined/)
    })
    it('should throw when deep variable not exist', async function () {
      ctx.push({ foo: 'FOO' })
      return await expect(async () => await ctx.get(['foo', 'bar', 'not', 'defined'])).rejects.toThrow(
        /undefined variable: foo.bar/
      )
    })
    it('should throw when itself not defined', async function () {
      ctx.push({ foo: 'FOO' })
      return await expect(async () => await ctx.get(['foo', 'BAR'])).rejects.toThrow(/undefined variable: foo.BAR/)
    })
    it('should find variable in parent scope', async function () {
      ctx.push({ foo: 'foo' })
      ctx.push({
        bar: 'bar'
      })
      expect(await ctx.get(['foo'])).toEqual('foo')
    })
  })
  describe('ownPropertyOnly', function () {
    let ctx: Context
    beforeEach(function () {
      ctx = new Context(ctx, {
        ownPropertyOnly: true
      } as any)
    })
    it('should return undefined for prototype object property', async function () {
      ctx.push({ foo: Object.create({ bar: 'BAR' }) })
      return expect(await ctx.get(['foo', 'bar'])).toEqual(undefined)
    })
    it('should use prototype when ownPropertyOnly=false', async function () {
      ctx = new Context({ foo: Object.create({ bar: 'BAR' }) }, { ownPropertyOnly: false } as any)
      return expect(await ctx.get(['foo', 'bar'])).toEqual('BAR')
    })
    it('should read inherited size when ownPropertyOnly=false', async function () {
      ctx = new Context({ foo: Object.create({ size: 99 }) }, { ownPropertyOnly: false } as any)
      return expect(await ctx.get(['foo', 'size'])).toEqual(99)
    })
    it('renderOptions.ownPropertyOnly should override options.ownPropertyOnly', async function () {
      ctx = new Context({ foo: Object.create({ bar: 'BAR' }) }, { ownPropertyOnly: false } as any, {
        ownPropertyOnly: true
      })
      return expect(await ctx.get(['foo', 'bar'])).toEqual(undefined)
    })
    it('should return undefined for Array.prototype.reduce', async function () {
      ctx.push({ foo: [] })
      return expect(await ctx.get(['foo', 'reduce'])).toEqual(undefined)
    })
    it('should return undefined for function prototype property', async function () {
      function Foo() {}
      Foo.prototype.bar = 'BAR'
      ctx.push({ foo: new (Foo as any)() })
      return expect(await ctx.get(['foo', 'bar'])).toEqual(undefined)
    })
    it('should allow function constructor properties', async function () {
      function Foo(this: any) {
        this.bar = 'BAR'
      }
      ctx.push({ foo: new (Foo as any)() })
      return expect(await ctx.get(['foo', 'bar'])).toEqual('BAR')
    })
    it('should return undefined for class method', async function () {
      class Foo {
        bar() {}
      }
      ctx.push({ foo: new Foo() })
      return expect(await ctx.get(['foo', 'bar'])).toEqual(undefined)
    })
    it('should allow class property', async function () {
      class Foo {
        bar = 'BAR'
      }
      ctx.push({ foo: new Foo() })
      return expect(await ctx.get(['foo', 'bar'])).toEqual('BAR')
    })
    it('should allow Array.prototype.length', async function () {
      ctx.push({ foo: [1, 2] })
      return expect(await ctx.get(['foo', 'length'])).toEqual(2)
    })
    it('should allow size to access Array.prototype.length', async function () {
      ctx.push({ foo: [1, 2] })
      return expect(await ctx.get(['foo', 'size'])).toEqual(2)
    })
    it('should allow size to access Set.prototype.size', async function () {
      ctx.push({ foo: new Set([1, 2]) })
      return expect(await ctx.get(['foo', 'size'])).toEqual(2)
    })
    it('should allow size to access Object key count', async function () {
      ctx.push({ foo: { bar: 'BAR', coo: 'COO' } })
      return expect(await ctx.get(['foo', 'size'])).toEqual(2)
    })
    it('should throw when property is hidden and strictVariables is true', async function () {
      ctx = new Context(ctx, {
        ownPropertyOnly: true,
        strictVariables: true
      } as any)
      ctx.push({ foo: Object.create({ bar: 'BAR' }) })
      return await expect(async () => await ctx.get(['foo', 'bar'])).rejects.toThrow(/undefined variable: foo.bar/)
    })
    it('should return undefined for inherited array indices', async function () {
      // eslint-disable-next-line no-extend-native
      Array.prototype[0] = 'POLLUTED'
      try {
        const a: number[] = []
        a.length = 1
        ctx.push({ foo: a })
        expect(await ctx.get(['foo', 0])).toEqual(undefined)
        expect(await ctx.get(['foo', -1])).toEqual(undefined)
        expect(await ctx.get(['foo', 'first'])).toEqual(undefined)
        expect(await ctx.get(['foo', 'last'])).toEqual(undefined)
      } finally {
        delete (Array.prototype as any)[0]
      }
    })
    it('should allow own blocked keys when ownPropertyOnly=false', async function () {
      ctx = new Context(
        {
          foo: {
            ...JSON.parse('{"__proto__": {"bar": "BAR"}}'),
            constructor: { name: 'Custom' },
            prototype: { x: 1 }
          }
        },
        { ownPropertyOnly: false } as any
      )
      expect(await ctx.get(['foo', '__proto__', 'bar'])).toEqual('BAR')
      expect(await ctx.get(['foo', 'constructor', 'name'])).toEqual('Custom')
      expect(await ctx.get(['foo', 'prototype', 'x'])).toEqual(1)
    })
    it('should allow inherited properties when ownPropertyOnly=false', async function () {
      ctx = new Context({ foo: Object.create({ __proto__: { bar: 'BAR' }, constructor: { name: 'Evil' } }) }, {
        ownPropertyOnly: false
      } as any)
      expect(await ctx.get(['foo', '__proto__', '__proto__', 'bar'])).toEqual('BAR')
      expect(await ctx.get(['foo', 'constructor', 'name'])).toEqual('Evil')
    })
    it('should block own constructor when ownPropertyOnly=true', async function () {
      ctx.push({ foo: { constructor: { name: 'Evil' } } })
      expect(await ctx.get(['foo', 'constructor'])).toEqual(undefined)
    })
    it('should block own prototype when ownPropertyOnly=true', async function () {
      ctx.push({ foo: { prototype: { bar: 'BAR' } } })
      expect(await ctx.get(['foo', 'prototype'])).toEqual(undefined)
    })
    it('should block own top-level __proto__ variable when ownPropertyOnly=true', async function () {
      ctx = new Context(JSON.parse('{"__proto__": {"bar": "BAR"}, "bar": "BAR"}'))
      expect(await ctx.get(['__proto__'])).toEqual(undefined)
      expect(await ctx.get(['bar'])).toEqual('BAR')
    })
  })
  describe('.getAll()', function () {
    it('should get all properties when arguments empty', async function () {
      expect(ctx.getAll()).toEqual(scope)
    })
  })
  describe('.push()', function () {
    it('should push scope', async function () {
      ctx.push({ bar: 'bar' })
      ctx.push({
        foo: 'foo'
      })
      expect(await ctx.get(['foo'])).toEqual('foo')
      expect(await ctx.get(['bar'])).toEqual('bar')
    })
    it('should hide deep properties by push', async function () {
      ctx.push({ bar: { bar: 'bar' } })
      ctx.push({ bar: { foo: 'foo' } })
      expect(await ctx.get(['bar', 'foo'])).toEqual('foo')
      expect(await ctx.get(['bar', 'bar'])).toEqual(undefined)
    })
    it('should return pushed scope for in-place mutation', async function () {
      const scope = ctx.push({})
      scope.item = 'ITEM'
      expect(await ctx.get(['item'])).toEqual('ITEM')
    })
  })
  describe('.pop()', function () {
    it('should pop scope', async function () {
      ctx.push({
        foo: 'foo'
      })
      ctx.pop()
      expect(await ctx.get(['foo'])).toEqual('zoo')
    })
  })
})
