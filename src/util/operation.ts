export interface OperationOptions {
  signal?: AbortSignal
}

const owners = new WeakMap<object, Operation>()

export function existingOperation(options: object): Operation | undefined {
  return owners.get(options)
}

export function operationFor(options: OperationOptions = {}): Operation {
  return owners.get(options) ?? new Operation(options.signal)
}

export function associate<T extends OperationOptions>(options: T, owner: Operation): T {
  owners.set(options, owner)
  return options
}

export class Operation {
  readonly controller = new AbortController()
  readonly signal = this.controller.signal
  private detach?: () => void
  private ticks = 0
  private started = Date.now()
  private settled = false
  private cancelled = false
  readonly secondary: unknown[] = []

  constructor(signal?: AbortSignal) {
    if (signal) {
      const abort = () => this.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      this.detach = () => signal.removeEventListener('abort', abort)
      if (signal.aborted) abort()
    }
  }

  abort(reason?: unknown) {
    if (!this.settled && !this.cancelled) {
      this.cancelled = true
      this.controller.abort(reason)
    }
  }

  check() {
    if (this.cancelled) throw this.signal.reason
    if (this.settled) throw new Error('Operation has completed')
  }

  checkpoint(): Promise<void> | undefined {
    this.check()
    this.ticks++
    if (this.ticks >= 1024 || (this.ticks % 64 === 0 && Date.now() - this.started >= 8)) {
      this.ticks = 0
      return this.wait(
        new Promise<void>(resolve => {
          const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown }).setImmediate
          if (immediate) immediate(resolve)
          else setTimeout(resolve, 0)
        })
      ).then(() => {
        this.started = Date.now()
      })
    }
  }

  wait<T>(value: PromiseLike<T>): Promise<T> {
    const state: { signal?: AbortSignal; resolve?: (value: T) => void; reject?: (error: unknown) => void } = {
      signal: this.signal
    }
    return new Promise<T>((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
      const clear = () => {
        state.signal?.removeEventListener('abort', abort)
        state.signal = undefined
        state.resolve = undefined
        state.reject = undefined
      }
      const abort = () => {
        state.reject?.(state.signal?.reason)
        clear()
      }
      state.signal!.addEventListener('abort', abort, { once: true })
      Promise.resolve(value).then(
        result => {
          state.resolve?.(result)
          clear()
        },
        error => {
          state.reject?.(error)
          clear()
        }
      )
      if (state.signal?.aborted) abort()
    })
  }

  finish() {
    this.settled = true
    this.detach?.()
    this.detach = undefined
  }
}
