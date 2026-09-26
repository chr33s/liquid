import type { OperationOptions } from '../util/operation'
import { LookupType } from '../fs'
import { isString, isValueToken } from '../util'
import { isControl, type Control } from '../render/control'
import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { Parser, Tokenizer } from '../parser'
import type { Arguments, Template } from '../template'
import type { Hash } from '../template/hash'
import type { Token, ValueToken } from '../tokens'
import { assert } from '../util'
import { TypeGuards, evalQuotedToken, evalToken } from '..'

export type ParsedFileName = Template[] | Token | string | undefined

export interface KeywordBinding {
  value: ValueToken
  alias?: string
}

export function parseFilePath(tokenizer: Tokenizer, liquid: Liquid, parser: Parser): ParsedFileName {
  if (liquid.options.dynamicPartials) {
    const file = tokenizer.readValue()
    tokenizer.assert(file, 'illegal file path')
    if (file!.getText() === 'none') return
    if (TypeGuards.isQuotedToken(file)) {
      const templates = parser.parse(evalQuotedToken(file))
      return staticPath(templates)
    }
    return file
  }
  const tokens = [...tokenizer.readFileNameTemplate(liquid.options)]
  const templates = staticPath(parser.parseTokens(tokens))
  return templates === 'none' ? undefined : templates
}

function staticPath(templates: Template[]): string | Template[] {
  if (templates.length === 1 && TypeGuards.isHTMLToken(templates[0].token)) return templates[0].token.getContent()
  return templates
}

export function* renderFilePath(
  file: ParsedFileName,
  ctx: Context,
  liquid: Liquid
): Generator<unknown, string | Control | undefined, unknown> {
  if (typeof file === 'string') return file
  if (Array.isArray(file)) {
    const rendered = yield liquid.renderer.renderTemplates(file, ctx)
    if (isControl(rendered)) return rendered
    return rendered as string
  }
  return (yield evalToken(file, ctx)) as string
}

export function* parseTemplates(
  liquid: Liquid,
  file: string,
  type: LookupType,
  currentFile?: string,
  options?: OperationOptions
): Generator<unknown, Template[], unknown> {
  return (yield liquid._parseFile(file, type, currentFile, options)) as Template[]
}

export function* withDepth<T>(ctx: Context, task: IterableIterator<T>): Generator<unknown, T, T> {
  ctx.depthLimit.use(1)
  try {
    return yield task
  } finally {
    ctx.depthLimit.release(1)
  }
}

export function* childTemplates(
  file: ParsedFileName,
  partials: boolean,
  load: () => Generator<unknown, Template[], unknown>
): Generator<unknown, Template[], unknown> {
  if (Array.isArray(file)) return file
  if (partials && isString(file)) return yield* load()
  return []
}

export function* hashValues(hash: Hash): Arguments {
  for (const value of Object.values(hash.hash)) {
    if (isValueToken(value)) yield value
  }
}

export function readKeyword(tokenizer: Tokenizer, keyword: string, alias = false): KeywordBinding | undefined {
  const begin = tokenizer.p
  const word = tokenizer.readIdentifier()
  if (word.content !== keyword) {
    tokenizer.p = begin
    return
  }
  tokenizer.skipBlank()
  if (tokenizer.peek() === ':') {
    tokenizer.p = begin
    return
  }
  const value = tokenizer.readValue()
  if (!value) {
    tokenizer.p = begin
    return
  }
  let name: string | undefined
  if (alias) {
    const beforeAs = tokenizer.p
    const asToken = tokenizer.readIdentifier()
    if (asToken.content === 'as') name = tokenizer.readIdentifier().content
    else tokenizer.p = beforeAs
  }
  tokenizer.skipBlank()
  if (tokenizer.peek() === ',') tokenizer.advance()
  return { value, alias: name }
}

export function* resolvePartial(
  file: ParsedFileName,
  ctx: Context,
  liquid: Liquid,
  lookup: LookupType,
  currentFile?: string
): Generator<unknown, { filepath: string; templates: Template[] } | Control, unknown> {
  const rendered = yield* renderFilePath(file, ctx, liquid)
  if (isControl(rendered)) return rendered
  assert(rendered, () => `illegal file path "${rendered}"`)
  const filepath = rendered as string
  const templates = yield* parseTemplates(liquid, filepath, lookup, currentFile, ctx.operationOptions)
  return { filepath, templates }
}
