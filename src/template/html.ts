import { TemplateImpl, Template } from '../template'
import { HTMLToken } from '../tokens'
import { Context } from '../context'
import { Emitter } from '../emitters'

export class HTML extends TemplateImpl<HTMLToken> implements Template {
  private str: string
  public readonly blank: boolean
  public constructor(token: HTMLToken) {
    super(token)
    this.str = token.getContent()
    this.blank = /^[ \t\r\n\f\v]*$/.test(this.str)
  }
  public *render(ctx: Context, emitter: Emitter): IterableIterator<void | Promise<void>> {
    yield emitter.write(this.str)
  }
}
