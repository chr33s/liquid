import { Liquid, Tag, Emitter, TagToken, TopLevelToken, Context, evalToken } from '..'
import { Parser } from '../parser'
import { assert, stringify, toValue } from '../util'
import { isHosted, requireProvider } from '../theme'
import { ValueToken } from '../tokens'
import { groupOrder, renderSection } from './section'
import type { Arguments } from '../template'

/**
 * `{% sections 'group' %}` renders a configured section group in order.
 */
export default class extends Tag {
  private target: ValueToken
  private currentFile?: string

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'sections is only available in the shopify_theme profile')
    const name = this.tokenizer.readValue()
    assert(name, () => `illegal tag: ${tagToken.getText()}`)
    this.target = name!
    this.currentFile = tagToken.file
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const name = stringify(toValue(yield evalToken(this.target, ctx)))
    const group = requireProvider(
      ctx.theme.sectionGroups?.[name],
      'sections',
      `no section group named "${name}" was provided`,
      ctx.capabilities
    )
    for (const key of groupOrder(group)) {
      const definition = group.sections?.[key]
      if (!definition) continue
      yield* renderSection(this.liquid, ctx, emitter, { ...definition, id: definition.id ?? key }, this.currentFile)
    }
  }

  public *arguments(): Arguments {
    yield this.target
  }
}
