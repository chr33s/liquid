import { Liquid, Tag, Emitter, Hash, TagToken, TopLevelToken, Context, Template, evalToken } from '..'
import { Parser } from '../parser'
import { assert, isValueToken, stringify, toValue } from '../util'
import type { Arguments } from '../template'
import { isHosted, requireProvider, type ThemeBlock } from '../theme'
import { ValueToken } from '../tokens'
import { schemaOf, settingDefaults, toBlockObject } from './section'

/**
 * `{% content_for "blocks" %}` renders the configured theme blocks in order.
 * `{% content_for "block", type: "x", id: "y" %}` renders one static block with
 * explicit arguments. Neither is a named inheritance override.
 */
export default class extends Tag {
  private target: ValueToken
  private hash: Hash
  private currentFile?: string

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'content_for is only available in the shopify_theme profile')
    const target = this.tokenizer.readValue()
    assert(target, () => `illegal tag: ${tagToken.getText()}`)
    this.target = target!
    this.tokenizer.skipBlank()
    if (this.tokenizer.peek() === ',') this.tokenizer.advance()
    this.hash = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    this.currentFile = tagToken.file
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const what = stringify(toValue(yield evalToken(this.target, ctx)))
    const args = (yield this.hash.render(ctx)) as Record<string, unknown>

    if (what === 'blocks') {
      const blocks = requireProvider(
        ctx.theme.blocks,
        'content_for.blocks',
        'no theme blocks were provided',
        ctx.capabilities
      )
      for (const [index, block] of blocks.entries()) {
        yield* this.renderBlock(ctx, emitter, block, index, {})
      }
      return
    }

    assert(what === 'block', () => `unknown content_for target "${what}"`)
    const type = stringify(toValue(args['type']))
    assert(type, 'content_for "block" requires a type')
    const id = args['id'] === undefined ? type : stringify(toValue(args['id']))
    const { type: _type, id: _id, ...rest } = args
    yield* this.renderBlock(ctx, emitter, { type, id }, 0, rest)
  }

  public *arguments(): Arguments {
    yield this.target
    yield* Object.values(this.hash.hash).filter(isValueToken)
  }

  private *renderBlock(
    ctx: Context,
    emitter: Emitter,
    block: ThemeBlock,
    index: number,
    extra: Record<string, unknown>
  ): Generator<unknown, void, unknown> {
    ctx.depthLimit.use(1)
    try {
      const templates = (yield this.liquid._parsePartialFile(
        `blocks/${block.type}`,

        this.currentFile,
        ctx.operationOptions
      )) as Template[]
      const childCtx = ctx.spawn()
      childCtx.theme = { ...ctx.theme, blocks: block.blocks ?? [] }
      const defaults = settingDefaults(schemaOf(templates).settings)
      Object.assign(childCtx.bottom(), extra, { block: toBlockObject(block, index, defaults) })
      yield this.liquid.renderer.renderTemplates(templates, childCtx, emitter)
    } finally {
      ctx.depthLimit.release(1)
    }
  }
}
