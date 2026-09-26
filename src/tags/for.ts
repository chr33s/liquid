import { Hash, Liquid, Tag, evalToken, Emitter, TagToken, TopLevelToken, Context, Template } from '..'
import { isValueToken, toEnumerable } from '../util'
import { ForloopDrop } from '../drop/forloop-drop'
import { Parser } from '../parser'
import { Arguments } from '../template'
import { parseClauses } from '../parser/clauses'
import { Break, Continue, isControl } from '../render/control'
import { readIteration } from './iteration'

const MODIFIERS = ['offset', 'limit', 'reversed']

export default class extends Tag {
  variable: string
  collection: import('../tokens').ValueToken
  hash: Hash
  templates: Template[] = []
  elseTemplates: Template[] = []

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const header = readIteration(this.tokenizer, token)
    this.variable = header.variable
    this.collection = header.collection
    this.hash = new Hash(this.tokenizer, liquid.options.keyValueSeparator)
    parseClauses({
      parser,
      remainTokens,
      tagToken: token,
      end: 'endfor',
      strictEnd: true,
      initial: () => this.templates,
      else: {
        policy: 'switch',
        strict: true,
        open: () => this.elseTemplates
      }
    })
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
    const r = this.liquid.renderer
    const continueKey = 'continue-' + this.variable + '-' + this.collection.getText()
    ctx.push({ continue: ctx.getRegister(continueKey, {}) })
    let hash: Record<string, any>
    try {
      hash = (yield this.hash.render(ctx)) as Record<string, any>
    } finally {
      ctx.pop()
    }

    const modifiers = this.liquid.options.orderedFilterParameters
      ? Object.keys(hash).filter(key => MODIFIERS.includes(key))
      : MODIFIERS.filter(key => hash[key] !== undefined)

    let collection = toEnumerable(yield evalToken(this.collection, ctx))
    collection = modifiers.reduce((items, modifier) => {
      if (modifier === 'offset') return items.slice(hash['offset'])
      if (modifier === 'limit') return items.slice(0, hash['limit'])
      return [...items].reverse()
    }, collection)

    ctx.setRegister(continueKey, (hash['offset'] || 0) + collection.length)
    if (!collection.length) {
      const control = yield r.renderTemplates(this.elseTemplates, ctx, emitter)
      if (isControl(control)) return control
      return
    }
    if (!this.templates.length) return

    const scope = ctx.push({ forloop: new ForloopDrop(collection.length, this.collection.getText(), this.variable) })
    try {
      for (const item of collection) {
        scope[this.variable] = item
        const control = yield r.renderTemplates(this.templates, ctx, emitter)
        if (control === Break) break
        scope.forloop.next()
        if (control === Continue) continue
      }
    } finally {
      ctx.pop()
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return [...this.templates, ...this.elseTemplates]
  }

  public *arguments(): Arguments {
    yield this.collection
    for (const value of Object.values(this.hash.hash)) {
      if (isValueToken(value)) yield value
    }
  }

  public blockScope(): Iterable<string> {
    return [this.variable, 'forloop']
  }
}
