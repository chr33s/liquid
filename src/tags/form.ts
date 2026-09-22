import { Liquid, Tag, Emitter, Hash, TagToken, TopLevelToken, Context, Template, ParseStream, evalToken } from '..'
import { Parser } from '../parser'
import { assert, isNil, isValueToken, stringify, toValue } from '../util'
import type { Arguments } from '../template'
import { escape } from '../filters/html'
import { isHosted, requireProvider } from '../theme'
import { ValueToken } from '../tokens'

/** Form types whose method and action the platform owns. */
const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'activate_customer_password',
  'cart',
  'contact',
  'create_customer',
  'currency',
  'customer',
  'customer_address',
  'customer_login',
  'guest_login',
  'localization',
  'new_comment',
  'product',
  'recover_customer_password',
  'reset_customer_password',
  'storefront_password'
])

/**
 * `{% form 'type', object %}` renders the platform's form element. The action,
 * method and hidden inputs come from the store provider; this tag never invents
 * them, and rendering a form is not carrying out the action behind it.
 */
export default class extends Tag {
  private type: ValueToken
  private subject?: ValueToken
  private hash: Hash
  templates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'form is only available in the shopify_theme profile')
    const type = this.tokenizer.readValue()
    assert(type, () => `illegal tag: ${tagToken.getText()}`)
    this.type = type!
    this.tokenizer.skipBlank()
    if (this.tokenizer.peek() === ',') {
      this.tokenizer.advance()
      const before = this.tokenizer.p
      const subject = this.tokenizer.readValue()
      this.tokenizer.skipBlank()
      // a trailing `key:` means this was an attribute, not the form subject
      if (subject && this.tokenizer.peek() !== ':') this.subject = subject
      else this.tokenizer.p = before
    }
    this.hash = new Hash(this.tokenizer, liquid.options.keyValueSeparator)

    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('tag:endform', () => stream.stop())
      .on('template', (tpl: Template) => this.templates.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
    stream.start()
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const type = stringify(toValue(yield evalToken(this.type, ctx)))
    assert(KNOWN_TYPES.has(type), () => `unknown form type "${type}"`)
    const subject = this.subject ? toValue(yield evalToken(this.subject, ctx)) : undefined
    const attributes = (yield this.hash.render(ctx)) as Record<string, unknown>

    const store = requireProvider(ctx.theme.store, 'form', 'no store provider supplies form actions', ctx.capabilities)
    const action = stringify(
      requireProvider(
        yield store.formAction?.(type, subject),
        'form.action',
        `the store provider has no action for form type "${type}"`,
        ctx.capabilities
      )
    )
    const inputs = ((yield store.formInputs?.(type, subject)) ?? {}) as Record<string, string>
    // every documented storefront form posts; the action distinguishes them
    const method = 'post'

    const request = ctx.theme.request ?? {}
    const form = {
      id: attributes['id'] ?? type,
      errors: request.form_errors ?? null,
      posted_successfully: request.posted_successfully ?? false
    }

    yield emitter.write(`<form method="${method}" action="${escape.call(undefined as never, action)}"`)
    yield emitter.write(renderAttributes(attributes))
    yield emitter.write('>')
    for (const [name, value] of Object.entries(inputs)) {
      yield emitter.write(
        `<input type="hidden" name="${escape.call(undefined as never, name)}" value="${escape.call(
          undefined as never,
          stringify(value)
        )}" />`
      )
    }
    ctx.push({ form })
    try {
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    } finally {
      ctx.pop()
      yield emitter.write('</form>')
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public *arguments(): Arguments {
    yield this.type
    if (this.subject) yield this.subject
    yield* Object.values(this.hash.hash).filter(isValueToken)
  }

  public blockScope(): Iterable<string> {
    return ['form']
  }
}

function renderAttributes(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .filter(([, value]) => !isNil(value) && value !== false)
    .map(([key, value]) => ` ${key}="${escape.call(undefined as never, stringify(toValue(value)))}"`)
    .join('')
}
