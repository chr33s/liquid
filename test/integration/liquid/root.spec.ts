import { normalize } from '../../../src/liquid-options'

describe('LiquidOptions#root', function () {
  describe('#normalize()', function () {
    it('should normalize string typed root array', function () {
      const options = normalize({ root: 'foo' })
      expect(options.root).toEqual(['foo'])
    })
    it('should reject null root', function () {
      expect(() => normalize({ root: null } as any)).toThrow('root must be a string or an array of strings')
    })
  })
})
