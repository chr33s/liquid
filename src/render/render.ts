import { RenderError, LiquidErrors, LiquidError, LimitError, inlineErrorMessage } from '../util'
import { Context } from '../context'
import { Template, isBlank, Output } from '../template'
import { Emitter, SimpleEmitter } from '../emitters'

export class Render {
  public *renderTemplates(
    templates: Template[],
    ctx: Context,
    emitter: Emitter = new SimpleEmitter(ctx.outputLengthLimit, ctx.operation)
  ): IterableIterator<any> {
    const errors = []
    ctx.templateLimit.use(templates.length)
    for (const tpl of templates) {
      ctx.operation.check()
      try {
        const html = yield tpl.render(ctx, emitter)
        if (html) yield emitter.write(html)
        if (ctx.breakCalled || ctx.continueCalled) break
      } catch (e) {
        ctx.operation.check()
        const err = LiquidError.is(e) ? e : new RenderError(e as Error, tpl)
        if (ctx.renderErrors === 'inline' && !LimitError.is(err)) {
          ctx.onError?.(err)
          // outside strict2 the reference writes no error text for a blank tag, like an `if` around an `assign`;
          // an `assign` itself never writes its error, whatever the mode
          const assign = (tpl as { name?: string }).name === 'assign'
          const quiet = assign || (ctx.opts.errorMode !== 'strict2' && isBlank(tpl) && !(tpl instanceof Output))
          if (err.name !== 'UndefinedVariableError' && !quiet) yield emitter.write(inlineErrorMessage(err))
          if (ctx.breakCalled || ctx.continueCalled) break
        } else if (ctx.opts.catchAllErrors && !LimitError.is(err)) errors.push(err)
        else throw err
      }
    }
    if (errors.length) {
      throw new LiquidErrors(errors)
    }
    return emitter.buffer
  }
}
