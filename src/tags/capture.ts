import { Liquid, Tag, Template, Context, TagToken, TopLevelToken } from '..'
import { Parser } from '../parser'
import { IdentifierToken, QuotedToken } from '../tokens'
import { parseClauses } from '../parser/clauses'
import { SimpleEmitter } from '../emitters'
import { isControl } from '../render/control'

export default class extends Tag {
  identifier: IdentifierToken | QuotedToken
  variable: string
  templates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    this.identifier = this.readVariable()
    this.variable = this.identifier.content
    parseClauses({
      parser,
      remainTokens,
      tagToken,
      end: 'endcapture',
      initial: () => this.templates
    })
  }

  private readVariable(): IdentifierToken | QuotedToken {
    const ident = this.tokenizer.readIdentifier()
    if (ident.content) return ident
    const quoted = this.tokenizer.readQuoted()
    if (quoted) return quoted
    throw this.tokenizer.error('invalid capture name')
  }

  *render(ctx: Context): Generator<unknown, unknown, string> {
    const captured = new SimpleEmitter(ctx.outputLengthLimit, ctx.operation)
    const control = yield this.liquid.renderer.renderTemplates(this.templates, ctx, captured)
    ctx.bottom()[this.variable] = captured.buffer
    if (isControl(control)) return control
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public *localScope(): Iterable<string | IdentifierToken | QuotedToken> {
    yield this.identifier
  }
}
