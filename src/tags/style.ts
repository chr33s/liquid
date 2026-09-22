import { Liquid, Tag, Emitter, TagToken, TopLevelToken, Context, Template, ParseStream } from '..'
import { Parser } from '../parser'
import { assert } from '../util'
import { isHosted } from '../theme'

/**
 * `{% style %}` evaluates its body as Liquid, so theme settings can reach CSS,
 * and emits it inside a `style[data-shopify]` element.
 */
export default class extends Tag {
  templates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'style is only available in the shopify_theme profile')
    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('tag:endstyle', () => stream.stop())
      .on('template', (tpl: Template) => this.templates.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
    stream.start()
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    yield emitter.write('<style data-shopify>')
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    yield emitter.write('</style>')
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }
}
