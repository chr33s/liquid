import { defaultOptions, normalize, pickLiquidOptions } from './liquid-options'
import { LiquidOptionError } from './util/error'

describe('liquid-options', () => {
  describe('.normalize()', () => {
    it('should set cache to undefined if specified to falsy', () => {
      const options = normalize({ cache: false })
      expect(options.cache).toBeUndefined()
    })
    it('should reject an invalid directory list', () => {
      expect(() => normalize({ root: 1 } as any)).toThrow(LiquidOptionError)
      expect(() => normalize({ partials: ['ok', 1] } as any)).toThrow(
        'partials must be a string or an array of strings'
      )
    })
    it('should reject an invalid cache', () => {
      expect(() => normalize({ cache: 'yes' } as any)).toThrow('invalid cache')
    })
    it('should not share default globals or operators between engines', () => {
      const first = normalize({})
      const second = normalize({})
      ;(first.globals as { name?: string }).name = 'first'
      first.operators.custom = () => true
      expect(second.globals).not.toHaveProperty('name')
      expect(second.operators).not.toHaveProperty('custom')
      expect(defaultOptions.globals).not.toHaveProperty('name')
      expect(defaultOptions.operators).not.toHaveProperty('custom')
      expect(first.globals).not.toBe(defaultOptions.globals)
      expect(first.operators).not.toBe(defaultOptions.operators)
    })
  })
  describe('.pickLiquidOptions()', () => {
    it('should omit caller-only flags', () => {
      expect(pickLiquidOptions({ root: 'views', context: { name: 'Ada' }, output: 'out.html' })).toEqual({
        root: 'views'
      })
    })
  })
})
