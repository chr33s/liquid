import { AssertionError, LimitError } from './error'

export class Limiter {
  private message: string
  private base = 0
  public readonly limit: number
  /**
   * `memory` marks a render budget of the reference engine, whose overrun reads
   * `Memory limits exceeded`; `cumulative` is a longer-lived budget every use is
   * also charged to; `message` replaces the default overrun message, and
   * `recoverable` raises an ordinary error the inline error policy can render.
   */
  constructor(
    resource: string,
    limit: number,
    {
      memory = false,
      cumulative,
      message,
      recoverable = false
    }: { memory?: boolean; cumulative?: Limiter; message?: string; recoverable?: boolean } = {}
  ) {
    this.message = message ?? `${memory ? 'Memory limits exceeded: ' : ''}${resource} limit exceeded`
    this.limit = limit
    this.cumulative = cumulative
    this.recoverable = recoverable
  }
  private readonly recoverable: boolean
  private readonly cumulative?: Limiter
  /** True when neither this limiter nor its cumulative budget can reject, so callers can skip accounting. */
  get unlimited(): boolean {
    return this.limit === Infinity && (!this.cumulative || this.cumulative.unlimited)
  }
  /** What has been charged so far. */
  get used() {
    return this.base
  }
  get remaining() {
    return this.limit - this.base
  }
  use(count: number) {
    if (+count > 0) {
      this.base += +count
      const exceeded = this.base > this.limit
      try {
        this.cumulative?.use(count)
      } catch (e) {
        if (!exceeded) throw e
      }
      if (!exceeded) return
      if (!this.recoverable) throw new LimitError(this.message)
      this.base -= +count
      throw new AssertionError(this.message)
    }
  }
  release(count: number) {
    if (+count > 0) {
      this.base -= +count
    }
  }
  check(count: number) {
    if (+count > 0 && +count > this.limit) throw new LimitError(this.message)
  }
}

/**
 * Work charged across every render that is handed the same ledger, for the
 * reference engine's cumulative render and assign scores. The per-render
 * `templateLimit` and `assignLimit` still start from zero on each render.
 */
export class ResourceLedger {
  public readonly template: Limiter
  public readonly assign: Limiter
  public constructor({ templateLimit = Infinity, assignLimit = Infinity } = {}) {
    this.template = new Limiter('cumulative template', templateLimit, { memory: true })
    this.assign = new Limiter('cumulative assign', assignLimit, { memory: true })
  }
}
