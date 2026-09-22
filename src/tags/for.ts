import {
  Hash,
  ValueToken,
  Liquid,
  Tag,
  evalToken,
  Emitter,
  TagToken,
  TopLevelToken,
  Context,
  Template,
  ParseStream
} from '..'
import {
  isValueToken,
  toSequence,
  seqReverse,
  offsetSequence,
  limitSequence,
  toIntegerArgument,
  Sequence,
  LiquidRange,
  sliceSequence,
  isString,
  isNil,
  toValue
} from '../util'
import { ForloopDrop } from '../drop/forloop-drop'
import { Parser } from '../parser'
import type { LoopMarkup } from '../parser/strict2'
import { hostedLimits, isHosted } from '../theme'
import { Arguments, blankBodies } from '../template'

const MODIFIERS = ['offset', 'limit', 'reversed']

type valueOf<T> = T[keyof T]

export default class extends Tag {
  variable: string
  collection: ValueToken
  hash: Hash
  templates: Template[]
  elseTemplates: Template[]

  constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    const parsed = token.parsed as LoopMarkup | undefined
    const variable = parsed?.variable ?? this.tokenizer.readIdentifier()
    const inStr = parsed ? 'in' : this.tokenizer.readIdentifier().content
    const collection = parsed?.collection ?? this.tokenizer.readValue()
    if (!variable.size() || inStr !== 'in' || !collection) {
      throw new Error(`illegal tag: ${token.getText()}`)
    }

    this.variable = variable.content
    this.collection = collection
    this.hash = new Hash(parsed?.hash ?? this.tokenizer, liquid.options.keyValueSeparator)
    this.templates = []
    this.elseTemplates = []

    let p
    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('start', () => (p = this.templates))
      .on<TagToken>('tag:else', () => {
        p = this.elseTemplates
      })
      .on<TagToken>('tag:endfor', () => {
        stream.stop()
      })
      .on('template', (tpl: Template) => p.push(tpl))
      .on('end', () => {
        throw new Error(`'${token.name}' tag was never closed`)
      })

    stream.start()
    this.blank = blankBodies([this.templates, this.elseTemplates], true)
  }
  public readonly blank: boolean;
  *render(ctx: Context, emitter: Emitter): Generator<unknown, void | string, Template[]> {
    const r = this.liquid.renderer
    const continueKey = 'continue-' + this.variable + '-' + this.collection.getText()
    ctx.push({ continue: ctx.getRegister(continueKey, 0) })
    let hash: Record<string, any>
    try {
      hash = (yield this.hash.render(ctx)) as Record<string, any>
    } finally {
      ctx.pop()
    }

    const modifiers = this.liquid.options.orderedFilterParameters
      ? Object.keys(hash).filter(x => MODIFIERS.includes(x))
      : MODIFIERS.filter(x => hash[x] !== undefined)

    const raw = yield evalToken(this.collection, ctx)
    let collection = toSequence(raw)
    if (isString(toValue(raw))) {
      // a string is one item, whatever the offset and limit
    } else if (this.liquid.options.orderedFilterParameters) {
      collection = modifiers.reduce((collection: Sequence, modifier: valueOf<typeof MODIFIERS>) => {
        if (modifier === 'offset') return offsetSequence(collection, hash['offset'])
        if (modifier === 'limit') return limitSequence(collection, hash['limit'])
        return seqReverse(collection)
      }, collection)
    } else {
      const from = toIntegerArgument(hash['offset'])
      const to = isNil(hash['limit']) ? undefined : from + toIntegerArgument(hash['limit'])
      collection = sliceSequence(collection, from, to)
      if (hash['reversed'] !== undefined) collection = seqReverse(collection)
    }

    // the hosted profile caps an unlimited loop over an array at the documented
    // 50 items; production renders a range in full
    if (isHosted(ctx.opts.profile) && !(raw instanceof LiquidRange) && hash['limit'] === undefined && !ctx.paginated) {
      collection = limitSequence(collection, hostedLimits.forLoopDefaultLimit)
    }

    ctx.setRegister(continueKey, toIntegerArgument(hash['offset']) + collection.length)

    if (!collection.length) {
      yield r.renderTemplates(this.elseTemplates, ctx, emitter)
      return
    }

    // each item visited over a range adds one to the render score; an empty
    // body visits every item and does nothing else, so it is charged at once
    const range = collection instanceof LiquidRange
    if (!this.templates.length) {
      if (range) ctx.templateLimit.use(collection.length)
      return
    }

    const parentloop = (yield ctx._get(['forloop'], false)) as unknown
    ctx.depthLimit.use(1)
    const scope = ctx.push({
      forloop: new ForloopDrop(
        collection.length,
        this.collection.getText(),
        this.variable,
        parentloop instanceof ForloopDrop ? parentloop : undefined
      )
    })
    try {
      for (const item of collection) {
        if (range) ctx.templateLimit.use(1)
        scope[this.variable] = item
        ctx.continueCalled = ctx.breakCalled = false
        yield r.renderTemplates(this.templates, ctx, emitter)
        if (ctx.breakCalled) break
        scope.forloop.next()
      }
    } finally {
      ctx.continueCalled = ctx.breakCalled = false
      ctx.pop()
      ctx.depthLimit.release(1)
    }
  }

  public *children(): Generator<unknown, Template[]> {
    const templates = this.templates.slice()
    if (this.elseTemplates) {
      templates.push(...this.elseTemplates)
    }
    return templates
  }

  public *arguments(): Arguments {
    yield this.collection

    for (const v of Object.values(this.hash.hash)) {
      if (isValueToken(v)) {
        yield v
      }
    }
  }

  public blockScope(): Iterable<string> {
    return [this.variable, 'forloop']
  }
}
