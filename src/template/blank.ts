import { HTML } from './html'
import type { Template } from './template'

/** Whether the reference calls a template blank: whitespace text, or a tag that renders nothing. */
export function isBlank(template: Template): boolean {
  return (template as { blank?: boolean }).blank === true
}

/**
 * Whether every template of a block's bodies is blank. `strip` then removes the
 * whitespace text from them, as `if`, `unless`, `case` and `for` do in the reference.
 */
export function blankBodies(bodies: Template[][], strip: boolean): boolean {
  const blank = bodies.every(body => body.every(isBlank))
  if (blank && strip) {
    for (const body of bodies) {
      for (let i = body.length - 1; i >= 0; i--) if (body[i] instanceof HTML) body.splice(i, 1)
    }
  }
  return blank
}
