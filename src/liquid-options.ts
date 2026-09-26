import type { OperationOptions } from './util/operation'
import { isArray, isFunction, isObject, isString } from './util'
import { LiquidOptionError } from './util/error'
import { getDateTimeFormat } from './util/intl'
import { LRU, LiquidCache } from './cache'
import { FS, LookupType } from './fs'
import * as fs from './fs/fs-impl'
import { defaultOperators, Operators } from './render'
import misc from './filters/misc'
import { escape } from './filters/html'
import { MapFS } from './fs/map-fs'

type OutputEscape = (value: any) => string
type OutputEscapeOption = 'escape' | 'json' | OutputEscape

export interface LiquidOptions {
  sourceByteLimit?: number
  baseUrl?: string
  /** A directory or an array of directories from where to resolve layout and include templates, and the filename passed to `.renderFile()`. If it's an array, the files are looked up in the order they occur in the array. Defaults to `["."]` */
  root?: string | string[]
  /** A directory or an array of directories from where to resolve included templates. If it's an array, the files are looked up in the order they occur in the array. Defaults to `root` */
  partials?: string | string[]
  /** A directory or an array of directories from where to resolve layout templates. If it's an array, the files are looked up in the order they occur in the array. Defaults to `root` */
  layouts?: string | string[]
  /** Allow refer to layouts/partials by relative pathname. To avoid arbitrary filesystem read, paths been referenced also need to be within corresponding root, partials, layouts. Defaults to `true`. */
  relativeReference?: boolean
  /** Use jekyll style include, pass parameters to `include` variable of current scope. Defaults to `false`. */
  jekyllInclude?: boolean
  /** Use jekyll style where filter, enables array item match. Defaults to `false`. */
  jekyllWhere?: boolean
  /** Add a extname (if filepath doesn't include one) before template file lookup. Eg: setting to `".html"` will allow including file by basename. Defaults to `""`. */
  extname?: string
  /** Whether or not to cache resolved templates. Defaults to `false`. */
  cache?: boolean | number | LiquidCache
  /** Use JavaScript Truthiness. Defaults to `false`. */
  jsTruthy?: boolean
  /** If set, treat the `filepath` parameter in `{%include filepath %}` and `{%layout filepath%}` as a variable, otherwise as a literal value. Defaults to `true`. */
  dynamicPartials?: boolean
  /** Whether or not to assert filter existence. If set to `false`, undefined filters will be skipped. Otherwise, undefined filters will cause an exception. Defaults to `false`. */
  strictFilters?: boolean
  /** Whether or not to assert variable existence.  If set to `false`, undefined variables will be rendered as empty string.  Otherwise, undefined variables will cause an exception. Defaults to `false`. */
  strictVariables?: boolean
  /** Catch all errors instead of exit upon one. Please note that render errors won't be reached when parse fails. */
  catchAllErrors?: boolean
  /** Limit template property reads on plain scope objects to own properties. Defaults to `true`. See https://github.com/chr33s/liquid/wiki/Tutorials.Document.Security-Model */
  ownPropertyOnly?: boolean
  /** Modifies the behavior of `strictVariables`. If set, a single undefined variable will *not* cause an exception in the context of the `if`/`elsif`/`unless` tag and the `default` filter. Instead, it will evaluate to `false` and `null`, respectively. Irrelevant if `strictVariables` is not set. Defaults to `false`. **/
  lenientIf?: boolean
  /** JavaScript timezone name or timezoneOffset for `date` filter, default to local time. That means if you're in Australia (UTC+10), it'll default to `-600` or `Australia/Lindeman` */
  timezoneOffset?: number | string
  /** Default date format to use if the date filter doesn't include a format. Defaults to `%A, %B %-e, %Y at %-l:%M %P %z`. */
  dateFormat?: string
  /** Default locale, will be used by date filter. Defaults to system locale. */
  locale?: string
  /** Strip blank characters (including ` `, `\t`, and `\r`) from the right of tags (`{% %}`) until `\n` (inclusive). Defaults to `false`. */
  trimTagRight?: boolean
  /** Similar to `trimTagRight`, whereas the `\n` is exclusive. Defaults to `false`. See Whitespace Control for details. */
  trimTagLeft?: boolean
  /** Strip blank characters (including ` `, `\t`, and `\r`) from the right of values (`{{ }}`) until `\n` (inclusive). Defaults to `false`. */
  trimOutputRight?: boolean
  /** Similar to `trimOutputRight`, whereas the `\n` is exclusive. Defaults to `false`. See Whitespace Control for details. */
  trimOutputLeft?: boolean
  /** The left delimiter for liquid tags. **/
  tagDelimiterLeft?: string
  /** The right delimiter for liquid tags. **/
  tagDelimiterRight?: string
  /** The left delimiter for liquid outputs. **/
  outputDelimiterLeft?: string
  /** The right delimiter for liquid outputs. **/
  outputDelimiterRight?: string
  /** Whether input strings to date filter preserve the given timezone **/
  preserveTimezones?: boolean
  /** Whether `trim*Left`/`trim*Right` is greedy. When set to `true`, all consecutive blank characters including `\n` will be trimmed regardless of line breaks. Defaults to `true`. */
  greedy?: boolean
  /** `fs` is used to override the default file-system module with a custom implementation. */
  fs?: FS
  /** keyValue separator */
  keyValueSeparator?: string
  /** Render from an in-memory `templates` mapping instead of the file system. When `templates` is set, Liquid uses the provided mapping for template lookup (including includes, layouts, and partials), and file-system options such as `fs`, `root`, `partials`, `layouts`, and `relativeReference` are effectively bypassed for those lookups. */
  templates?: { [key: string]: string }
  /** the global scope passed down to all partial and layout templates, i.e. templates included by `include`, `layout` and `render` tags. */
  globals?: object
  /** Default escape filter applied to output values, when set, you'll have to add `| raw` for values don't need to be escaped. Defaults to `undefined`. */
  outputEscape?: OutputEscapeOption
  /** An object of operators for conditional statements. Defaults to the regular Liquid operators. */
  operators?: Operators
  /** Respect parameter order when using filters like "for ... reversed limit", Defaults to `false`. */
  orderedFilterParameters?: boolean
  /** For DoS handling, limit total length of templates parsed in one `parse()` call. A typical PC can handle 1e8 (100M) characters without issues. */
  parseLimit?: number
  /** For DoS handling, limit total renders of tag/HTML/output in one `render()` call. */
  templateLimit?: number
  /** For DoS handling, limit total output length in one `render()` call. */
  outputLengthLimit?: number
  /** For DoS handling, limit nesting depth of `{% render %}`, `{% include %}`, and `{% layout %}` tags. Defaults to `128`. */
  maxDepth?: number
}

export interface RenderOptions extends OperationOptions {
  /**
   * Same as `globals` on LiquidOptions, but only for current render() call
   */
  globals?: object
  /**
   * Same as `strictVariables` on LiquidOptions, but only for current render() call
   */
  strictVariables?: boolean
  /**
   * Same as `ownPropertyOnly` on LiquidOptions, but only for current render() call
   */
  ownPropertyOnly?: boolean
  /** For DoS handling, limit total renders of tag/HTML/output in one `render()` call. */
  templateLimit?: number
  /** For DoS handling, limit total output length in one `render()` call. */
  outputLengthLimit?: number
}

export interface RenderFileOptions extends RenderOptions {
  lookupType?: LookupType
}

interface NormalizedOptions extends LiquidOptions {
  root?: string[]
  partials?: string[]
  layouts?: string[]
  cache?: LiquidCache
  outputEscape?: OutputEscape
}

export interface NormalizedFullOptions extends NormalizedOptions {
  root: string[]
  partials: string[]
  layouts: string[]
  relativeReference: boolean
  jekyllInclude: boolean
  extname: string
  cache?: LiquidCache
  jsTruthy: boolean
  dynamicPartials: boolean
  fs: FS
  strictFilters: boolean
  strictVariables: boolean
  ownPropertyOnly: boolean
  lenientIf: boolean
  dateFormat: string
  locale: string
  trimTagRight: boolean
  trimTagLeft: boolean
  trimOutputRight: boolean
  trimOutputLeft: boolean
  tagDelimiterLeft: string
  tagDelimiterRight: string
  outputDelimiterLeft: string
  outputDelimiterRight: string
  preserveTimezones: boolean
  greedy: boolean
  globals: object
  operators: Operators
  parseLimit: number
  templateLimit: number
  outputLengthLimit: number
  maxDepth: number
}

const unconfiguredFS: FS = {
  readFile() {
    throw new LiquidOptionError('fs is not configured')
  },
  exists() {
    throw new LiquidOptionError('fs is not configured')
  },
  resolve() {
    throw new LiquidOptionError('fs is not configured')
  }
}

const booleanOptionKeys = [
  'relativeReference',
  'jekyllInclude',
  'jekyllWhere',
  'jsTruthy',
  'dynamicPartials',
  'strictFilters',
  'strictVariables',
  'ownPropertyOnly',
  'lenientIf',
  'trimTagRight',
  'trimTagLeft',
  'trimOutputRight',
  'trimOutputLeft',
  'preserveTimezones',
  'greedy',
  'orderedFilterParameters',
  'catchAllErrors'
] as const satisfies readonly (keyof LiquidOptions)[]

const stringOptionKeys = [
  'extname',
  'dateFormat',
  'locale',
  'keyValueSeparator',
  'tagDelimiterLeft',
  'tagDelimiterRight',
  'outputDelimiterLeft',
  'outputDelimiterRight',
  'baseUrl'
] as const satisfies readonly (keyof LiquidOptions)[]

const limitOptionKeys = ['parseLimit', 'templateLimit', 'outputLengthLimit', 'maxDepth'] as const

const cliOptionKeys = [
  'cache',
  'extname',
  'jekyllInclude',
  'jsTruthy',
  'layouts',
  'lenientIf',
  'dynamicPartials',
  'greedy',
  'relativeReference',
  'orderedFilterParameters',
  'outputDelimiterLeft',
  'outputDelimiterRight',
  'partials',
  'preserveTimezones',
  'root',
  'strictFilters',
  'strictVariables',
  'tagDelimiterLeft',
  'tagDelimiterRight',
  'timezoneOffset',
  'trimOutputLeft',
  'trimOutputRight',
  'trimTagLeft',
  'trimTagRight'
] as const satisfies readonly (keyof LiquidOptions)[]

export const defaultOptions: NormalizedFullOptions = {
  root: ['.'],
  layouts: ['.'],
  partials: ['.'],
  relativeReference: true,
  jekyllInclude: false,
  keyValueSeparator: ':',
  cache: undefined,
  extname: '',
  fs: unconfiguredFS,
  dynamicPartials: true,
  jsTruthy: false,
  dateFormat: '%A, %B %-e, %Y at %-l:%M %P %z',
  locale: '',
  trimTagRight: false,
  trimTagLeft: false,
  trimOutputRight: false,
  trimOutputLeft: false,
  greedy: true,
  tagDelimiterLeft: '{%',
  tagDelimiterRight: '%}',
  outputDelimiterLeft: '{{',
  outputDelimiterRight: '}}',
  preserveTimezones: false,
  strictFilters: false,
  strictVariables: false,
  ownPropertyOnly: true,
  lenientIf: false,
  globals: {},
  operators: defaultOperators,
  parseLimit: Infinity,
  templateLimit: Infinity,
  outputLengthLimit: Infinity,
  maxDepth: 128
}

function normalizeCache(cache: LiquidOptions['cache']): LiquidCache | undefined {
  if (cache == null || cache === false) return undefined
  if (cache === true) return new LRU(1024)
  if (typeof cache === 'number') return cache > 0 ? new LRU(cache) : undefined
  if (isObject(cache) && isFunction(cache.read) && isFunction(cache.write) && isFunction(cache.remove)) return cache
  throw new LiquidOptionError('invalid cache')
}

export function pickLiquidOptions(flags: object): LiquidOptions {
  const source = flags as Partial<LiquidOptions>
  const options: LiquidOptions = {}
  for (const key of cliOptionKeys) {
    if (source[key] !== undefined) options[key] = source[key] as never
  }
  return options
}

export function normalize(input: LiquidOptions): NormalizedFullOptions {
  validateOptions(input)
  const limit = input.sourceByteLimit ?? Infinity
  if (input.baseUrl !== undefined) {
    try {
      new URL(input.baseUrl)
    } catch (error) {
      throw new LiquidOptionError(error instanceof Error ? error.message : String(error))
    }
  }

  const hasTemplates = input.templates != null
  const fileSystem = hasTemplates ? new MapFS(input.templates!) : (input.fs ?? fs.createFS(input.baseUrl))
  let relativeReference = input.relativeReference ?? defaultOptions.relativeReference
  if (hasTemplates) relativeReference = true
  else if ((!fileSystem.dirname || !fileSystem.sep) && relativeReference) {
    console.warn(
      '[LiquidJS] `fs.dirname` and `fs.sep` are required for relativeReference, set relativeReference to `false` to suppress this warning'
    )
    relativeReference = false
  }

  const normalized: NormalizedFullOptions = {
    ...defaultOptions,
    ...input,
    sourceByteLimit: limit,
    fs: fileSystem,
    relativeReference,
    root: normalizeDirectoryList(directorySource(input, 'root', hasTemplates), 'root'),
    partials: normalizeDirectoryList(directorySource(input, 'partials', hasTemplates), 'partials'),
    layouts: normalizeDirectoryList(directorySource(input, 'layouts', hasTemplates), 'layouts'),
    cache: 'cache' in input ? normalizeCache(input.cache) : undefined,
    outputEscape: input.outputEscape === undefined ? undefined : getOutputEscapeFunction(input.outputEscape),
    locale: input.locale || getDateTimeFormat()?.().resolvedOptions().locale || 'en-US',
    dynamicPartials: input.dynamicPartials ?? (input.jekyllInclude ? false : defaultOptions.dynamicPartials),
    jekyllInclude: input.jekyllInclude ?? defaultOptions.jekyllInclude,
    globals: input.globals ?? {},
    operators: input.operators ?? { ...defaultOperators }
  }
  if (!isFunction(normalized.fs.readFile) || !isFunction(normalized.fs.exists) || !isFunction(normalized.fs.resolve)) {
    throw new LiquidOptionError('fs requires readFile, exists, and resolve methods')
  }
  return normalized
}

function directorySource(
  input: LiquidOptions,
  key: 'root' | 'partials' | 'layouts',
  hasTemplates: boolean
): string | string[] | undefined {
  if (hasTemplates) return ['.']
  if (key in input) return input[key]
  if ('root' in input) return input.root
  return defaultOptions[key]
}

function validateOptions(input: LiquidOptions) {
  for (const key of booleanOptionKeys) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new LiquidOptionError(`invalid ${key}`)
  }
  for (const key of stringOptionKeys) {
    if (input[key] !== undefined && !isString(input[key])) throw new LiquidOptionError(`invalid ${key}`)
  }
  if (
    input.timezoneOffset !== undefined &&
    !isString(input.timezoneOffset) &&
    typeof input.timezoneOffset !== 'number'
  ) {
    throw new LiquidOptionError('invalid timezoneOffset')
  }
  if (
    input.sourceByteLimit !== undefined &&
    input.sourceByteLimit !== Infinity &&
    !(Number.isSafeInteger(input.sourceByteLimit) && input.sourceByteLimit >= 0)
  ) {
    throw new LiquidOptionError('invalid sourceByteLimit')
  }
  for (const key of limitOptionKeys) {
    const value = input[key]
    if (value === undefined || value === Infinity) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new LiquidOptionError(`invalid ${key}`)
    }
  }
  if (input.globals !== undefined && (!isObject(input.globals) || isArray(input.globals))) {
    throw new LiquidOptionError('invalid globals')
  }
  if (input.operators !== undefined && (!isObject(input.operators) || isArray(input.operators))) {
    throw new LiquidOptionError('invalid operators')
  }
  if (input.templates !== undefined) {
    if (!isObject(input.templates) || isArray(input.templates)) throw new LiquidOptionError('invalid templates')
    for (const value of Object.values(input.templates)) {
      if (!isString(value)) throw new LiquidOptionError('invalid templates')
    }
  }
  if (input.fs !== undefined && (!isObject(input.fs) || isArray(input.fs))) throw new LiquidOptionError('invalid fs')
}

function getOutputEscapeFunction(nameOrFunction: OutputEscapeOption): OutputEscape {
  if (nameOrFunction === 'escape') return escape
  if (nameOrFunction === 'json') return misc.json
  if (!isFunction(nameOrFunction)) {
    throw new LiquidOptionError('`outputEscape` need to be of type string or function')
  }
  return nameOrFunction
}

export function normalizeDirectoryList(value: unknown, label = 'directory'): string[] {
  if (value === undefined) return []
  if (isString(value)) return [value]
  if (isArray(value) && value.every(isString)) return value.slice()
  throw new LiquidOptionError(`${label} must be a string or an array of strings`)
}
