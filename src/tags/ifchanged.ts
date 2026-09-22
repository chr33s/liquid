import { Liquid, Tag, Emitter, TagToken, TopLevelToken, Context, Template, ParseStream } from '..'
import { Parser } from '../parser'
import { SimpleEmitter } from '../emitters'
import { blankBodies } from '../template'

export default class extends Tag {
  templates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('tag:endifchanged', () => stream.stop())
      .on('template', (tpl: Template) => this.templates.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
    stream.start()
    this.blank = blankBodies([this.templates], false)
  }
  public readonly blank: boolean;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    // the last rendered value lives in a context register, so sibling
    // ifchanged nodes share one memory rather than caching per node
    // buffered separately: only the text this node actually emits is charged
    const buffered = new SimpleEmitter()
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, buffered)
    const html = buffered.buffer
    if (html !== ctx.getRegister('ifchanged')) {
      ctx.setRegister('ifchanged', html)
      yield emitter.write(html)
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }
}
