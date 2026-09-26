import { isPromise, isIterator } from './underscore'
import { Operation, type OperationOptions } from './operation'

let current: Operation | undefined

/** @internal The operation whose driver is stepping the running generator, if any. */
export function driving(): Operation | undefined {
  return current
}

export function toPromise<T>(
  value: Generator<unknown, T, unknown> | Promise<T> | T,
  options: OperationOptions = {}
): Promise<T> {
  return operate(options, () => value, driving())
}

/**
 * @internal Drive `task` under `parent` when `options` add no signal of their own, else under a new operation linked
 * to both signals. The owner is the `Operation` argument, never a hidden property of `options`.
 */
export async function operate<T, O extends OperationOptions>(
  options: O,
  task: (options: O) => Generator<unknown, T, unknown> | IterableIterator<T> | Promise<T> | T,
  parent?: Operation
): Promise<T> {
  if (parent?.covers(options.signal)) {
    const owned = options.signal ? options : ({ ...options, signal: parent.signal } as O)
    return parent.join(drive(task(owned) as Generator<unknown, T, unknown>, parent))
  }
  const owner = new Operation(options.signal, parent?.signal)
  const owned = { ...options, signal: owner.signal } as O
  const run = async () => {
    try {
      owner.check()
      const result = await drive(task(owned) as Generator<unknown, T, unknown>, owner)
      owner.check()
      return result
    } finally {
      await owner.drain()
      owner.finish()
    }
  }
  return parent ? parent.join(run()) : run()
}

export async function drive<T>(
  value: Generator<unknown, T, unknown> | Promise<T> | T,
  owner: Operation,
  cleanup = false
): Promise<T> {
  const stack: Iterator<any, any, any>[] = []
  let input: any = value
  let method: 'next' | 'throw' = 'next'
  try {
    while (true) {
      if (method === 'next') {
        if (isIterator(input)) {
          stack.push(input)
          input = undefined
        } else if (isPromise(input)) {
          try {
            input = await (cleanup ? input : owner.wait(input))
            if (!cleanup) owner.check()
            continue
          } catch (error) {
            if (!cleanup && owner.signal.aborted) throw owner.signal.reason
            input = error
            method = 'throw'
          }
        }
      }
      if (!cleanup) {
        const pause = owner.checkpoint()
        if (pause) await pause
      }
      if (!stack.length) {
        if (method === 'throw') throw input
        return input as T
      }
      const iterator = stack[stack.length - 1]
      const previous = current
      current = owner
      try {
        const state = iterator[method]!(input)
        input = state.value
        if (state.done) stack.pop()
        method = 'next'
      } catch (error) {
        stack.pop()
        method = 'throw'
        input = error
      } finally {
        current = previous
      }
    }
  } catch (error) {
    if (!cleanup && owner.signal.aborted) {
      while (stack.length) {
        const iterator = stack.pop()!
        try {
          let state = iterator.return!(undefined)
          while (!state.done) {
            try {
              state = iterator.next(await drive(state.value, owner, true))
            } catch (secondary) {
              state = iterator.throw!(secondary)
            }
          }
        } catch {}
      }
      throw owner.signal.reason
    }
    throw error
  }
}
