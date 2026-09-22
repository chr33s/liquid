import { Liquid, TagToken, TopLevelToken, Tag, Context } from '..'
import { assert, assertEmpty, isTagToken } from '../util'
import { isHosted } from '../theme'

/**
 * `{% schema %}` carries section metadata. Its body is JSON read verbatim: it
 * is never executed as Liquid and never rendered.
 */
export default class extends Tag {
  public readonly source: string
  public readonly schema: Record<string, unknown>

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'schema is only available in the shopify_theme profile')
    assertEmpty(tagToken.args, `${tagToken.getText()} takes no arguments`)
    const parts: string[] = []
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (isTagToken(token) && token.name === 'endschema') {
        this.source = parts.join('')
        this.schema = parse(this.source)
        return
      }
      parts.push(token.getText())
    }
    throw new Error(`'${tagToken.name}' tag was never closed`)
  }

  render(ctx: Context) {
    // metadata, not output: record it so the runtime can read it back
    const collected = ctx.getRegister('schema', [] as Record<string, unknown>[])
    assert(collected.length === 0, 'a template may hold only one {% schema %}')
    collected.push(this.schema)
  }
}

function parse(source: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (e) {
    throw new Error(`invalid schema: ${(e as Error).message}`)
  }
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'schema must be a JSON object')
  return value as Record<string, unknown>
}
