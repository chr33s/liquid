import { MapFS } from './map-fs'
describe('MapFS', () => {
  const fs = new MapFS({})
  describe('#resolve()', () => {
    it('should resolve relative file paths', () => {
      expect(fs.resolve('foo/bar', 'coo', '')).toEqual('foo/bar/coo')
    })
    it('should resolve to parent', () => {
      expect(fs.resolve('foo/bar', '../coo', '')).toEqual('foo/coo')
    })
    it('should resolve to root', () => {
      expect(fs.resolve('foo/bar', '../../coo', '')).toEqual('coo')
    })
    it('should resolve exceeding root', () => {
      expect(fs.resolve('foo/bar', '../../../coo', '')).toEqual('coo')
    })
    it('should resolve from absolute path', () => {
      expect(fs.resolve('/foo/bar', '../../coo', '')).toEqual('/coo')
    })
    it('should resolve exceeding root from absolute path', () => {
      expect(fs.resolve('/foo/bar', '../../../coo', '')).toEqual('/coo')
    })
    it('should resolve from invalid path', () => {
      expect(fs.resolve('foo//bar', '../coo', '')).toEqual('foo/coo')
    })
    it('should resolve current path', () => {
      expect(fs.resolve('foo/bar', '.././coo', '')).toEqual('foo/coo')
    })
    it('should resolve invalid path', () => {
      expect(fs.resolve('foo/bar', '..//coo', '')).toEqual('foo/coo')
    })
  })
  describe('#.readFile()', () => {
    it('should throw if not exist', async () => {
      await expect(async () => await fs.readFile('foo/bar')).rejects.toThrow('NOENT: foo/bar')
    })
    it('should treat inherited names as missing', async () => {
      expect(await fs.exists('constructor')).toBe(false)
      await expect(fs.readFile('toString')).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })
})
