import { Liquid, Tag, Emitter, TagToken, TopLevelToken, Context, Template, ParseStream, evalToken } from '..'
import { Parser } from '../parser'
import { ValueToken } from '../tokens'
import {
  assert,
  isObject,
  isPropertyAccessToken,
  isValueToken,
  stringify,
  toSequence,
  toValue,
  toIntegerArgument
} from '../util'
import type { Scope } from '../context'
import { Arguments } from '../template'
import { PaginateDrop, hostedLimits, isHosted, type PaginatedSource } from '../theme'

export default class extends Tag {
  private collection: ValueToken
  private pageSize?: ValueToken
  private pageParam = 'page'
  templates: Template[] = []

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    const tokenizer = this.tokenizer
    const collection = tokenizer.readValue()
    assert(collection, () => `illegal tag: ${tagToken.getText()}`)
    this.collection = collection!

    const by = tokenizer.readIdentifier()
    if (by.content === 'by') this.pageSize = tokenizer.readValue()
    else tokenizer.p = tokenizer.p - by.size()

    while (!tokenizer.end()) {
      tokenizer.skipBlank()
      // attributes may be separated by a comma or by blanks alone
      if (tokenizer.peek() === ',') {
        tokenizer.advance()
        tokenizer.skipBlank()
      }
      const key = tokenizer.readIdentifier()
      if (!key.size()) break
      tokenizer.skipBlank()
      if (tokenizer.peek() === ':') tokenizer.advance()
      const value = tokenizer.readValue()
      if (key.content === 'window_size') this.windowSize = Number(value?.getText()) || undefined
      if (key.content === 'page_param') this.pageParam = stripQuotes(value?.getText() ?? 'page')
    }

    const stream: ParseStream = parser
      .parseStream(remainTokens)
      .on('tag:endpaginate', () => stream.stop())
      .on('template', (tpl: Template) => this.templates.push(tpl))
      .on('end', () => {
        throw new Error(`'${tagToken.name}' tag was never closed`)
      })
    stream.start()
  }

  private windowSize?: number;

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    assert(isHosted(ctx.opts.profile), 'paginate is only available in the shopify_theme profile')
    const raw = toValue(yield evalToken(this.collection, ctx))
    const pageSize = this.pageSize === undefined ? 20 : toIntegerArgument(yield evalToken(this.pageSize, ctx))
    assert(
      pageSize >= hostedLimits.paginateMinPageSize && pageSize <= hostedLimits.paginateMaxPageSize,
      () =>
        `paginate page size must be between ${hostedLimits.paginateMinPageSize} and ${hostedLimits.paginateMaxPageSize}`
    )

    const source = resolveSource(raw, ctx)
    const items = Math.min(source.size, hostedLimits.paginateMaxItems)
    const request = ctx.theme.request ?? {}
    const query = request.query ?? {}
    const currentPage = Math.max(1, toIntegerArgument(firstValue(query[this.pageParam]) ?? 1))

    const paginate = new PaginateDrop(
      items,
      pageSize,
      currentPage,
      request.path ?? '',
      query,
      this.pageParam,
      this.windowSize ?? hostedLimits.paginateWindowSize
    )
    const from = paginate.current_offset
    const page = yield source.slice(from, Math.min(from + pageSize, items))

    // the body re-reads the collection by the path it was written with, so the
    // slice shadows that path rather than appearing under a new name
    const scope = (yield this.pageScope(ctx, page)) as Scope
    scope['paginate'] = paginate
    ctx.push(scope)
    const wasPaginated = ctx.paginated
    ctx.paginated = true
    try {
      yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    } finally {
      ctx.paginated = wasPaginated
      ctx.pop()
    }
  }

  public *children(): Generator<unknown, Template[]> {
    return this.templates
  }

  public *arguments(): Arguments {
    yield this.collection
    if (isValueToken(this.pageSize)) yield this.pageSize
  }

  /**
   * A scope in which the collection's own path resolves to the current page,
   * rebuilding only the objects along that path.
   */
  private *pageScope(ctx: Context, page: unknown): Generator<unknown, Scope, unknown> {
    const keys = yield* this.pathKeys(ctx)
    const [root, ...rest] = keys
    if (root === undefined) return {}
    if (!rest.length) return { [root]: page }
    const base = yield ctx._get([root], false)
    return { [root]: replaceAt(base, rest, page) }
  }

  private *pathKeys(ctx: Context): Generator<unknown, string[], unknown> {
    if (!isPropertyAccessToken(this.collection)) return [this.collection.getText()]
    const keys: string[] = []
    for (const prop of this.collection.props) {
      keys.push(stringify(toValue(yield evalToken(prop, ctx))))
    }
    return keys
  }

  public blockScope(): Iterable<string> {
    return ['paginate', collectionName(this.collection)]
  }
}

/**
 * The page slice is bound under the final segment of the collection path, so
 * `collection.products` and `collection["products"]` both bind `products`.
 */
/**
 * A shallow copy of `base` whose `keys` path ends in `value`. The copy keeps the
 * prototype, so accessors and `liquidMethodMissing` on a Drop still answer.
 */
function replaceAt(base: unknown, keys: string[], value: unknown): unknown {
  const [key, ...rest] = keys
  if (key === undefined) return value
  if (!isObject(base)) return { [key]: replaceAt(undefined, rest, value) }
  const source = base as Record<string, unknown>
  const descriptors = Object.getOwnPropertyDescriptors(source)
  descriptors[key] = {
    value: replaceAt(source[key], rest, value),
    enumerable: true,
    writable: true,
    configurable: true
  }
  return Object.create(Object.getPrototypeOf(source), descriptors)
}

function collectionName(token: ValueToken): string {
  if (isPropertyAccessToken(token)) {
    const last = token.props[token.props.length - 1] as { content?: unknown } | undefined
    if (last !== undefined) return stringify(toValue(last.content))
  }
  return token.getText()
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function stripQuotes(text: string): string {
  return text.replace(/^["']|["']$/g, '')
}

/**
 * A provider may page a collection without loading it; otherwise the value is
 * read as an ordinary sequence.
 */
function resolveSource(raw: unknown, ctx: Context): PaginatedSource {
  const provided = ctx.theme.store?.paginate?.(raw)
  if (provided) {
    ctx.capabilities.record('paginate.source', 'implemented')
    return provided
  }
  const seq = toSequence(raw)
  return { size: seq.length, slice: (from, to) => [...seq.slice(from, to)] }
}
