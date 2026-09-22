import { Liquid, TagToken, TopLevelToken, Tag, Context } from '..'
import { assert, assertEmpty, isTagToken } from '../util'
import { isHosted } from '../theme'

/**
 * `{% stylesheet %}` and `{% javascript %}` collect a file's static asset
 * content. The body is taken verbatim and produces no output.
 */
export abstract class AssetTag extends Tag {
  public readonly content: string
  protected abstract readonly kind: 'stylesheet' | 'javascript'

  public constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, kind: string) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), `${kind} is only available in the shopify_theme profile`)
    assertEmpty(tagToken.args, `${tagToken.getText()} takes no arguments`)
    const parts: string[] = []
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (isTagToken(token) && token.name === `end${kind}`) {
        this.content = parts.join('')
        return
      }
      parts.push(token.getText())
    }
    throw new Error(`'${tagToken.name}' tag was never closed`)
  }

  public render(ctx: Context) {
    const collected = ctx.getRegister(`${this.kind}Assets`, [] as string[])
    // repeated renders of one file contribute the asset once
    if (!collected.includes(this.content)) collected.push(this.content)
  }
}

export class StylesheetTag extends AssetTag {
  protected readonly kind = 'stylesheet' as const
  public constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid, 'stylesheet')
  }
}

export class JavascriptTag extends AssetTag {
  protected readonly kind = 'javascript' as const
  public constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid, 'javascript')
  }
}
