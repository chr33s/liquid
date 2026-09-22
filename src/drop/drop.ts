import { Context } from '../context'

const DROP_INTERNALS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'liquidMethodMissing',
  'hiddenMembers',
  'toLiquid',
  'valueOf'
])

export abstract class Drop {
  [key: string]: any
  /**
   * Members a template may never read. Subclasses add their own internals so
   * that reading a Drop cannot invoke bookkeeping methods such as `next`.
   */
  public hiddenMembers(): ReadonlySet<string> {
    return DROP_INTERNALS
  }
  public liquidMethodMissing(key: string | number, context: Context): Promise<any> | any {
    return undefined
  }
}

export function hideMembers(...names: string[]): ReadonlySet<string> {
  return new Set([...DROP_INTERNALS, ...names])
}
