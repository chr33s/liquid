export const Break = Symbol('liquid.break')
export const Continue = Symbol('liquid.continue')
export type Control = typeof Break | typeof Continue

export function isControl(value: unknown): value is Control {
  return value === Break || value === Continue
}
