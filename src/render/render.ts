import { RenderError, LiquidErrors, LiquidError } from '../util'
import { Context } from '../context'
import { Template } from '../template'
import { Emitter, SimpleEmitter } from '../emitters'
import { isControl } from './control'

export class Render {
  public *renderTemplates(templates: Template[], ctx: Context, emitter?: Emitter): IterableIterator<unknown> {
    const output = emitter ?? new SimpleEmitter(ctx.outputLengthLimit, ctx.operation)
    const errors = []
    for (const tpl of templates) {
      ctx.operation?.check()
      ctx.templateLimit.use(1)
      try {
        const html = yield tpl.render(ctx, output)
        if (isControl(html)) return html
        if (html) yield output.write(html)
      } catch (e) {
        ctx.operation?.check()
        const err = LiquidError.is(e) ? e : new RenderError(e as Error, tpl)
        if (ctx.opts.catchAllErrors) errors.push(err)
        else throw err
      }
    }
    if (errors.length) {
      throw new LiquidErrors(errors)
    }
    return output.buffer
  }
}
