/* istanbul ignore file */
export const version = '[VI]{version}[/VI]'
export * as TypeGuards from './util/type-guards'
export {
  toValue,
  createTrie,
  type Trie,
  toPromise,
  assert,
  LiquidError,
  ParseError,
  RenderError,
  UndefinedVariableError,
  TokenizationError,
  AssertionError
} from './util'
export type { LiquidErrors } from './util/error'
export { Drop } from './drop'
export type { Comparable } from './drop'
export type { Emitter } from './emitters'
export { defaultOperators, type Operators, evalToken, evalQuotedToken, Expression, isFalsy, isTruthy } from './render'
export { Context, type Scope } from './context'
export {
  Value,
  Hash,
  type Template,
  type FilterImplOptions,
  Tag,
  Filter,
  Output,
  Variable,
  type VariableLocation,
  type VariableSegments,
  type Variables,
  type StaticAnalysis,
  type StaticAnalysisOptions,
  analyze,
  type Arguments,
  type PartialScope
} from './template'
export type { TagRenderReturn } from './template'
export { Token, type TopLevelToken, TagToken, type ValueToken } from './tokens'
export type { RangeToken, LiteralToken, QuotedToken, PropertyAccessToken, NumberToken } from './tokens'
export { TokenKind, Tokenizer, ParseStream, Parser } from './parser'
export { filters } from './filters'
export * from './tags'
export { defaultOptions } from './liquid-options'
export type { LiquidOptions, RenderOptions, RenderFileOptions } from './liquid-options'
export { type FS, LookupType } from './fs'
export { Liquid } from './liquid'

export type { OperationOptions } from './util/operation'
export type { FileReadOptions } from './fs/fs'
