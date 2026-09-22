import { toPromise } from './async'
describe('utils/async', () => {
  describe('#toPromise()', function () {
    it('should return a promise', async () => {
      function* foo() {
        return 'foo'
      }
      const result = await toPromise(foo())
      expect(result).toBe('foo')
    })
    it('should support iterable with single return statement', async () => {
      function* foo() {
        return 'foo'
      }
      const result = await toPromise(foo())
      expect(result).toBe('foo')
    })
    it('should support promise', async () => {
      function foo() {
        return Promise.resolve('foo')
      }
      const result = await toPromise(foo())
      expect(result).toBe('foo')
    })
    it('should resolve dependency', async () => {
      function* foo(): Generator<Generator<string>> {
        return yield bar()
      }
      function* bar(): Generator<string> {
        return 'bar'
      }
      const result = await toPromise(foo())
      expect(result).toBe('bar')
    })
    it('should support promise dependency', async () => {
      function* foo(): Generator<Promise<string>> {
        return yield Promise.resolve('foo')
      }
      const result = await toPromise(foo())
      expect(result).toBe('foo')
    })
    it('should evaluate generators returned by asynchronous dependencies', async () => {
      function* child() {
        return 'child'
      }
      function* parent(): Generator<unknown, string, string> {
        const value = yield Promise.resolve(child())
        return `result:${value}`
      }
      expect(await toPromise(parent())).toBe('result:child')
    })
    it('should reject Promise if dependency throws synchronously', async () => {
      function* foo(): Generator<Generator<never>> {
        return yield bar()
      }
      function* bar(): Generator<never> {
        throw new Error('bar')
      }
      await expect(toPromise(foo())).rejects.toThrow('bar')
    })
    it('should resume promise after catch', async () => {
      function* foo() {
        let ret = ''
        try {
          yield bar()
        } catch (e) {
          ret += 'bar'
        }
        ret += 'foo'
        return ret
      }
      function* bar(): Generator<never> {
        throw new Error('bar')
      }
      const ret = await toPromise(foo())
      expect(ret).toBe('barfoo')
    })
  })
  describe('#toPromise()', function () {
    it('should throw Error if dependency throws synchronously', async () => {
      function* foo(): Generator<Generator<never>> {
        return yield bar()
      }
      function* bar(): Generator<never> {
        throw new Error('bar')
      }
      await expect(async () => await toPromise(foo())).rejects.toThrow('bar')
    })
    it('should resume yield after catch', async () => {
      function* foo(): Generator<unknown, never, never> {
        try {
          yield bar()
        } catch (e) {}
        return yield 'foo'
      }
      function* bar(): Generator<never> {
        throw new Error('bar')
      }
      expect(await toPromise(foo())).toBe('foo')
    })
    it('should resume return after catch', async () => {
      function* foo(): Generator<Generator<never>, string> {
        try {
          yield bar()
        } catch (e) {}
        return 'foo'
      }
      function* bar(): Generator<never> {
        throw new Error('bar')
      }
      expect(await toPromise(foo())).toBe('foo')
    })
    it('should return non iterator value as it is', async () => {
      expect(await toPromise('foo')).toBe('foo')
    })
  })
})
