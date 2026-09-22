import * as nodeFS from 'fs/promises'
import { Liquid } from '../liquid'
import { readFile } from './fs-impl'

vi.mock('fs/promises', { spy: true })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {
    resolve = yes
  })
  return { promise, resolve }
}

describe('Node source ownership', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes cancellation to the unbounded native read', async () => {
    const signal = new AbortController().signal
    const native = vi.spyOn(nodeFS, 'readFile').mockResolvedValue('source')
    await expect(readFile('page', { signal })).resolves.toBe('source')
    expect(native).toHaveBeenCalledWith('page', { encoding: 'utf8', signal })
  })

  it('stops finite reads incrementally and closes the handle', async () => {
    const close = vi.fn(async () => {})
    const read = vi.fn(async (buffer: Uint8Array) => {
      buffer.fill(97, 0, 4)
      return { bytesRead: 4 }
    })
    vi.spyOn(nodeFS, 'open').mockResolvedValue({ read, close } as any)
    await expect(readFile('page', { sourceByteLimit: 5 })).rejects.toThrow('source byte limit exceeded')
    expect(read).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes a handle acquired after an operation stopped waiting for open', async () => {
    const opened = deferred<any>()
    const entered = deferred<void>()
    const closed = deferred<void>()
    const read = vi.fn()
    vi.spyOn(nodeFS, 'open').mockImplementation(() => {
      entered.resolve()
      return opened.promise
    })
    const engine = new Liquid({
      sourceByteLimit: 10,
      relativeReference: false,
      fs: { resolve: (_root, file) => file, exists: () => true, readFile }
    })
    const controller = new AbortController()
    const result = engine.parseFile('page', undefined, { signal: controller.signal })
    await entered.promise
    controller.abort('cancelled')
    await expect(result).rejects.toBe('cancelled')
    opened.resolve({
      read,
      close: async () => {
        closed.resolve()
      }
    })
    await closed.promise
    expect(read).not.toHaveBeenCalled()
  })
})
