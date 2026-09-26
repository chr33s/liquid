import { BlockMode } from '../context'
import { BlockDrop } from '../drop'
import { Liquid, TagToken, TopLevelToken, Template, Context, Emitter, Tag } from '..'
import { Parser } from '../parser'
import { parseClauses } from '../parser/clauses'
import { isControl } from '../render/control'

export default class extends Tag {
  block: string
  templates: Template[] = []

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const quoted = this.tokenizer.readQuoted()
    this.block = quoted ? quoted.content : this.tokenizer.readIdentifier().content
    parseClauses({
      parser,
      remainTokens,
      tagToken: token,
      end: 'endblock',
      initial: () => this.templates
    })
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const blockRender = this.getBlockRender(ctx)
    if (ctx.getRegister('blockMode') === BlockMode.STORE) {
      ctx.getRegister('blocks', Object.create(null) as Record<string, any>)[this.block] = blockRender
      return
    }
    const result = yield blockRender(new BlockDrop(undefined, ctx), emitter)
    if (isControl(result)) return result
  }

  private getBlockRender(ctx: Context) {
    const self = this as Tag
    const { liquid, templates } = this
    const renderChild = ctx.getRegister('blocks', Object.create(null) as Record<string, any>)[this.block]
    const renderCurrent = function* (superBlock: BlockDrop, emitter: Emitter): Generator<unknown, unknown, unknown> {
      const stack: Tag[] = ctx.getRegister('blockStack', [])
      if (stack.includes(self)) throw new Error('block tag cannot be nested')
      stack.push(self)
      ctx.push({ block: superBlock })
      try {
        const result = yield liquid.renderer.renderTemplates(templates, ctx, emitter)
        if (isControl(result)) return result
      } finally {
        ctx.pop()
        stack.pop()
      }
    }
    if (!renderChild) return renderCurrent
    return function* (superBlock: BlockDrop, emitter: Emitter): Generator<unknown, unknown, unknown> {
      const result = yield renderChild(
        new BlockDrop((target: Emitter) => renderCurrent(superBlock, target), ctx),
        emitter
      )
      if (isControl(result)) return result
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public blockScope(): Iterable<string> {
    return ['block']
  }
}
