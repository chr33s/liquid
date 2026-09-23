import * as fs from './fs-impl'
import { resolve } from 'path'
import { Loader, LookupType } from './loader'
import { toPromise } from '../util/async'
describe('fs/loader', function () {
  describe('.candidates()', function () {
    it('should resolve relatively', function () {
      const loader = new Loader({ relativeReference: true, fs, extname: '' } as any)
      const candidates = [...loader.candidates('./foo/bar', ['/root', '/root/foo'], '/root/current')]
      expect(candidates).toContain(resolve('/root/foo/bar'))
    })
  })
  describe('.load()', function () {
    it('should not include out of root candidates', async function () {
      const mockFs = { ...fs, exists: async () => true, readFile: async () => '' }
      const loader = new Loader({ relativeReference: true, fs: mockFs, extname: '', partials: ['/root'] } as any)
      await expect(
        async () => await toPromise(loader.load('../foo/bar', LookupType.Partials, '/root/current'))
      ).rejects.toThrow(/ENOENT/)
    })
    it('should treat root as a terminated path', async function () {
      const mockFs = { ...fs, exists: async () => true, readFile: async () => '' }
      const loader = new Loader({ relativeReference: true, fs: mockFs, extname: '', partials: ['/root'] } as any)
      await expect(
        async () => await toPromise(loader.load('../root-dir/bar', LookupType.Partials, '/root/current'))
      ).rejects.toThrow(/ENOENT/)
    })
    it('should use permissive contains when fs.contains is omitted', async function () {
      const mockFs = {
        ...fs,
        exists: async () => true,
        readFile: async () => '',
        contains: undefined
      }
      const loader = new Loader({ relativeReference: true, fs: mockFs, extname: '', partials: ['/root'] } as any)
      const result = await toPromise(loader.load('./foo/bar', LookupType.Partials, '/root/current'))
      expect(result.filepath).toBe(resolve('/root/foo/bar'))
    })
    it('should enforce containment for LookupType.Root', async function () {
      const mockFs = { ...fs, exists: async () => true, readFile: async () => '' }
      const loader = new Loader({ relativeReference: false, fs: mockFs, extname: '', root: ['/safe'] } as any)
      await expect(async () => await toPromise(loader.load('/etc/hosts', LookupType.Root))).rejects.toThrow(/ENOENT/)
    })
  })
})
