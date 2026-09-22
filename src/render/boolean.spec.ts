import { isTruthy, isFalsy } from './boolean'
import { Context } from '../context'
import { Drop } from '..'

describe('boolean Shopify', function () {
  describe('.isTruthy()', function () {
    const ctx = {
      opts: {
        jsTruthy: false
      }
    } as unknown as Context

    class BooleanDrop extends Drop {
      public valueOf() {
        return false
      }
    }

    // Spec: https://shopify.github.io/liquid/basics/truthy-and-falsy/
    it('true is truthy', function () {
      expect(isTruthy(true, ctx)).toBeTruthy()
    })
    it('false is falsy', function () {
      expect(isTruthy(false, ctx)).toBeFalsy()
    })
    it('null is falsy', function () {
      expect(isTruthy(null, ctx)).toBeFalsy()
    })
    it('"foo" is truthy', function () {
      expect(isTruthy('foo', ctx)).toBeTruthy()
    })
    it('"" is truthy', function () {
      expect(isTruthy('', ctx)).toBeTruthy()
    })
    it('0 is truthy', function () {
      expect(isTruthy(0, ctx)).toBeTruthy()
    })
    it('1 is truthy', function () {
      expect(isTruthy(1, ctx)).toBeTruthy()
    })
    it('1.1 is truthy', function () {
      expect(isTruthy(1.1, ctx)).toBeTruthy()
    })
    it('[1] is truthy', function () {
      expect(isTruthy([1], ctx)).toBeTruthy()
    })
    it('[] is truthy', function () {
      expect(isTruthy([], ctx)).toBeTruthy()
    })
    it('drop valueOf determines truthy', function () {
      expect(isTruthy(new BooleanDrop(), ctx)).toBeFalsy()
    })
  })
})
