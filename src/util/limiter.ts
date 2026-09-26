import { LiquidLimitError } from './error'

export class Limiter {
  private message: string
  private base = 0
  private limit: number
  constructor(resource: string, limit: number) {
    this.message = `${resource} limit exceeded`
    this.limit = limit
  }
  get remaining() {
    return this.limit - this.base
  }
  use(count: number) {
    if (+count > 0) {
      if (this.base + +count > this.limit) throw new LiquidLimitError(this.message)
      this.base += +count
    }
  }
  release(count: number) {
    if (+count > 0) {
      this.base -= +count
    }
  }
  check(count: number) {
    if (+count > 0 && +count > this.limit) throw new LiquidLimitError(this.message)
  }
}
