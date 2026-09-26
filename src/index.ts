/* istanbul ignore file */
/**
 * Supported caller API: {@link Liquid}, its render, parse, stream, analysis, and registry methods, plus {@link LiquidOptions}, {@link RenderOptions}, {@link RenderFileOptions}, {@link StaticAnalysis}, and {@link LiquidFailure}.
 *
 * Supported extension protocol: generator methods on {@link Liquid}, {@link Tag}, {@link Drop}, {@link FS}, {@link Emitter}, and sync, Promise, or generator returns from tags, filters, and filesystem methods. Tag authors also use {@link Value}, {@link Hash}, {@link Context}, {@link TagToken}, and {@link TopLevelToken}.
 *
 * Other exports from this entry are unstable and may change without a major version. Do not delete them in this version.
 */
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
  LiquidErrors,
  LiquidOptionError,
  LiquidLimitError,
  LiquidLookupError,
  isLiquidFailure,
  type LiquidFailure,
  AssertionError
} from './util'
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
