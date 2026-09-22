import { RenderError, LiquidErrors, LiquidError } from '../util'
import { Context } from '../context'
import { Template } from '../template'
import { Emitter, SimpleEmitter } from '../emitters'

export class Render {
  public *renderTemplates(
    templates: Template[],
    ctx: Context,
    emitter: Emitter = new SimpleEmitter(ctx.outputLengthLimit, ctx.operation)
  ): IterableIterator<any> {
    const errors = []
    for (const tpl of templates) {
      ctx.operation.check()
      ctx.templateLimit.use(1)
      try {
        const html = yield tpl.render(ctx, emitter)
        if (html) yield emitter.write(html)
        if (ctx.breakCalled || ctx.continueCalled) break
      } catch (e) {
        ctx.operation.check()
        const err = LiquidError.is(e) ? e : new RenderError(e as Error, tpl)
        if (ctx.opts.catchAllErrors) errors.push(err)
        else throw err
      }
    }
    if (errors.length) {
      throw new LiquidErrors(errors)
    }
    return emitter.buffer
  }
}
