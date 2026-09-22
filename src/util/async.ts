import { isPromise, isIterator } from './underscore'
import { Operation, operationFor, type OperationOptions } from './operation'

export async function toPromise<T>(
  value: Generator<unknown, T, unknown> | Promise<T> | T,
  options: OperationOptions = {}
): Promise<T> {
  const owner = operationFor(options)
  try {
    const result = await drive(value, owner)
    owner.check()
    return result
  } finally {
    owner.finish()
  }
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
      try {
        const state = iterator[method]!(input)
        input = state.value
        if (state.done) stack.pop()
        method = 'next'
      } catch (error) {
        stack.pop()
        method = 'throw'
        input = error
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
              owner.secondary.push(secondary)
              state = iterator.throw!(secondary)
            }
          }
        } catch (secondary) {
          owner.secondary.push(secondary)
        }
      }
      throw owner.signal.reason
    }
    throw error
  }
}
