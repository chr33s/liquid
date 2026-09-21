import { isString, forOwn } from '../../src/util/underscore'
import * as fs from '../../src/fs/fs-impl'
import { resolve, sep } from 'path'

interface FileDescriptor {
  mode: string
  content: string
}

let files: { [path: string]: FileDescriptor } = {}

export function mock(options: { [path: string]: string | FileDescriptor }) {
  forOwn(options, (val, key) => {
    files[resolve(key)] = isString(val) ? { mode: '33188', content: val } : (val as FileDescriptor)
  })
  vi.spyOn(fs, 'readFile').mockImplementation(async function (path: string) {
    return fs.readFileSync(path)
  })
  vi.spyOn(fs, 'readFileSync').mockImplementation(function (path: string) {
    const file = files[path]
    if (file === undefined) throw new Error('ENOENT')
    if (file.mode === '0000') throw new Error('EACCES')
    return file.content
  })
  vi.spyOn(fs, 'exists').mockImplementation(async function (path: string) {
    return fs.existsSync(path)
  })
  vi.spyOn(fs, 'existsSync').mockImplementation(function (path: string) {
    return !!files[path]
  })
  vi.spyOn(fs, 'contains').mockImplementation(async (root: string, file: string) => {
    root = resolve(root)
    if (!root.endsWith(sep)) root += sep
    return file.startsWith(root)
  })
  vi.spyOn(fs, 'containsSync').mockImplementation((root: string, file: string) => {
    root = resolve(root)
    if (!root.endsWith(sep)) root += sep
    return file.startsWith(root)
  })
}

export function restore() {
  files = {}
  vi.restoreAllMocks()
}
