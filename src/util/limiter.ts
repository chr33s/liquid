import { assert } from './assert'

export class Limiter {
  private message: string
  private base = 0
  private limit: number
  constructor(resource: string, limit: number) {
    this.message = `${resource} limit exceeded`
    this.limit = limit
  }
  /** True when this limiter can never reject, so callers can skip accounting. */
  get unlimited() {
    return this.limit === Infinity
  }
  get remaining() {
    return this.limit - this.base
  }
  use(count: number) {
    if (+count > 0) {
      assert(this.base + +count <= this.limit, this.message)
      this.base += +count
    }
  }
  release(count: number) {
    if (+count > 0) {
      this.base -= +count
    }
  }
  check(count: number) {
    if (+count > 0) {
      assert(+count <= this.limit, this.message)
    }
  }
}
