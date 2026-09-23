import { stringify, Limiter, Operation } from '../util'
import { Emitter } from './emitter'

export class StreamedEmitter implements Emitter {
  public buffer = ''
  readonly stream: ReadableStream<string>
  private controller!: ReadableStreamDefaultController<string>
  private demand?: () => void
  private pending?: Promise<void>
  private terminal = false
  completion: Promise<unknown> = Promise.resolve()

  constructor(
    private owner: Operation,
    public outputLengthLimit?: Limiter
  ) {
    this.stream = new ReadableStream<string>(
      {
        start: controller => {
          this.controller = controller
        },
        pull: () => {
          this.demand?.()
          this.demand = undefined
        },
        cancel: reason => {
          this.terminal = true
          owner.abort(reason)
          return this.completion.then(
            () => {},
            () => {}
          )
        }
      },
      { highWaterMark: 65_536, size: chunk => chunk.length }
    )
  }

  write(value: any): Promise<void> | void {
    this.owner.check()
    if (this.pending) {
      const error = new Error('Overlapping emitter writes: await or yield each write')
      this.owner.abort(error)
      throw error
    }
    const text = stringify(value)
    this.outputLengthLimit?.use(text.length)
    let offset = 0
    while (offset < text.length && !this.saturated) {
      this.controller.enqueue(text.slice(offset, (offset += 16_384)))
    }
    if (!text || !this.saturated) return
    const task = this.accept(text, offset)
    this.pending = task
    task.then(
      () => {
        this.pending = undefined
      },
      () => {
        this.pending = undefined
      }
    )
    return task
  }

  private get saturated() {
    return this.controller.desiredSize !== null && this.controller.desiredSize <= 0
  }

  private async accept(text: string, offset: number) {
    while (true) {
      while (this.saturated) {
        await this.owner.wait(
          new Promise<void>(resolve => {
            this.demand = resolve
          })
        )
        this.owner.check()
      }
      if (offset >= text.length) return
      this.controller.enqueue(text.slice(offset, (offset += 16_384)))
    }
  }

  async end() {
    await this.pending
    this.owner.check()
    if (!this.terminal) {
      this.terminal = true
      this.controller.close()
    }
  }

  error(reason: unknown) {
    if (!this.terminal) {
      this.terminal = true
      this.controller.error(reason)
    }
  }
}
