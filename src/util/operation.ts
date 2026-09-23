export interface OperationOptions {
  signal?: AbortSignal
}

const owners = new WeakMap<object, Operation>()

export function existingOperation(options: object): Operation | undefined {
  return owners.get(options)
}

export function associate<T extends OperationOptions>(options: T, owner: Operation): T {
  owners.set(options, owner)
  return options
}

function yieldToHost(resolve: () => void) {
  const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown }).setImmediate
  if (immediate) immediate(resolve)
  else if (typeof MessageChannel === 'function') {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      resolve()
    }
    port2.postMessage(undefined)
  } else setTimeout(resolve, 0)
}

export class Operation {
  readonly controller = new AbortController()
  readonly signal = this.controller.signal
  private detach?: () => void
  private ticks = 0
  private started = Date.now()
  private settled = false
  private cancelled = false
  private readonly pending = new Set<Promise<unknown>>()

  constructor(...signals: (AbortSignal | undefined)[]) {
    const detach: (() => void)[] = []
    for (const signal of signals) {
      if (!signal) continue
      const abort = () => this.abort(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      detach.push(() => signal.removeEventListener('abort', abort))
      if (signal.aborted) abort()
    }
    if (detach.length) this.detach = () => detach.forEach(remove => remove())
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
      return this.wait(new Promise<void>(yieldToHost)).then(() => {
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

  async join<T>(task: Promise<T>): Promise<T> {
    this.pending.add(task)
    try {
      return await task
    } finally {
      this.pending.delete(task)
    }
  }

  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled(this.pending)
  }

  finish() {
    this.settled = true
    this.detach?.()
    this.detach = undefined
  }
}
