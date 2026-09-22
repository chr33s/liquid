import type { OperationOptions } from './util/operation'
import { assert, isArray, isString, isFunction } from './util'
import { getDateTimeFormat } from './util/intl'
import { LRU, LiquidCache } from './cache'
import { FS, LookupType } from './fs'
import * as fs from './fs/fs-impl'
import { defaultOperators, Operators } from './render'
import { json } from './filters/misc'
import { escape } from './filters/html'
import { MapFS } from './fs/map-fs'
import type { FilterImplOptions } from './template/filter-impl-options'
import type { LiquidProfile, ThemeProviders } from './theme'
import type { LiquidError } from './util/error'
import type { ResourceLedger } from './util/limiter'

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
  /** Add a extname (if filepath doesn't include one) before template file lookup. Eg: setting to `".html"` will allow including file by basename. Defaults to `""`. */
  extname?: string
  /** Whether or not to cache resolved templates. Defaults to `false`. */
  cache?: boolean | number | LiquidCache
  /** Whether or not to assert filter existence. If set to `false`, undefined filters will be skipped. Otherwise, undefined filters will cause an exception. Defaults to `false`. */
  strictFilters?: boolean
  /** Whether or not to assert variable existence.  If set to `false`, undefined variables will be rendered as empty string.  Otherwise, undefined variables will cause an exception. Defaults to `false`. */
  strictVariables?: boolean
  /** Catch all errors instead of exit upon one. Please note that render errors won't be reached when parse fails. */
  catchAllErrors?: boolean
  /** What a render error does: `"raise"` stops rendering and rejects with it, `"inline"` writes `Liquid error (line N): message` in place of the failing node and continues. Exceeding a resource limit stops rendering under both. Defaults to `"raise"`. */
  renderErrors?: RenderErrorPolicy
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
  /** Whether a date string with an offset, like `2020-06-15 14:30:00 -0400`, keeps that offset in the `date` filter, as in the reference engine. Defaults to keeping it unless `timezoneOffset` is set. **/
  preserveTimezones?: boolean
  /** Whether `trim*Left`/`trim*Right` is greedy. When set to `true`, all consecutive blank characters including `\n` will be trimmed regardless of line breaks. Defaults to `true`. */
  greedy?: boolean
  /** When a `{%-` or `{{-` trims away all of the text before it, keep its first character, as the reference's `bug_compatible_whitespace_trimming` parse option does. Shopify's storefront renders themes this way. Defaults to `false`. */
  bugCompatibleWhitespaceTrimming?: boolean
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
  /** For DoS handling, limit the render score of one `render()` call: each tag, HTML and output node rendered adds one, as does each item a loop visits over a range. */
  templateLimit?: number
  /** For DoS handling, limit total output length in one `render()` call. */
  outputLengthLimit?: number
  /** For DoS handling, limit the nesting depth of scopes at render time: the template itself, each `{% render %}`, `{% include %}` and `{% layout %}`, and each `{% for %}` and `{% tablerow %}` loop. Exceeding it raises `Nesting too deep`. Defaults to `100`, as in the reference engine. */
  maxDepth?: number
  /** For DoS handling, limit nesting depth of block tags at parse time. Defaults to `128`. */
  maxParseDepth?: number
  /** How to treat markup the grammar does not accept, such as text left over after a complete expression or an operator missing an operand: `"lax"` ignores it, `"warn"` records it in `liquid.warnings`, `"strict"` throws. `"strict2"` throws too, and also rejects a bare bracket lookup like `['key']`, which must be written `self['key']`. Defaults to `"lax"`. */
  errorMode?: 'lax' | 'warn' | 'strict' | 'strict2'
  /** Which dialect to render: `"core"` is the reference engine, `"shopify_theme"` adds the documented hosted theme limits, tags and filters. Defaults to `"core"`. */
  profile?: LiquidProfile
  /** Data and services the hosted theme dialect renders against. */
  theme?: ThemeProviders
  /** For DoS handling, limit the assign score of one `render()` call. Every `{% assign %}` and `{% capture %}` adds to it, re-binding a variable included: a string scores its UTF-8 byte length, an array or hash one plus the score of what it holds, any other value one. */
  assignLimit?: number
}

export type RenderErrorPolicy = 'raise' | 'inline'

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
   * Same as `strictFilters` on LiquidOptions, but only for current render() call
   */
  strictFilters?: boolean
  /**
   * Same as `renderErrors` on LiquidOptions, but only for current render() call
   */
  renderErrors?: RenderErrorPolicy
  /**
   * Called with each render error the `"inline"` policy recovered from, in render order.
   */
  onError?: (error: LiquidError) => void
  /**
   * Filters available to the current render() call only, taking precedence over
   * the engine-wide registry. The same parsed template can therefore be rendered
   * against different filter registries.
   */
  filters?: Record<string, FilterImplOptions>
  /**
   * Same as `theme` on LiquidOptions, but only for current render() call
   */
  theme?: ThemeProviders
  /**
   * Same as `ownPropertyOnly` on LiquidOptions, but only for current render() call
   */
  ownPropertyOnly?: boolean
  /** For DoS handling, limit total renders of tag/HTML/output in one `render()` call. */
  templateLimit?: number
  /** For DoS handling, limit total output length in one `render()` call. */
  outputLengthLimit?: number
  /** For DoS handling, limit the assign score of one `render()` call: see `assignLimit` on LiquidOptions. */
  assignLimit?: number
  /**
   * Cumulative budgets charged by every render handed this ledger, on top of
   * the per-render `templateLimit` and `assignLimit`.
   */
  ledger?: ResourceLedger
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
  extname: string
  cache?: LiquidCache
  fs: FS
  strictFilters: boolean
  strictVariables: boolean
  renderErrors: RenderErrorPolicy
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
  preserveTimezones?: boolean
  greedy: boolean
  bugCompatibleWhitespaceTrimming: boolean
  globals: object
  operators: Operators
  parseLimit: number
  templateLimit: number
  outputLengthLimit: number
  assignLimit: number
  maxDepth: number
  maxParseDepth: number
  errorMode: 'lax' | 'warn' | 'strict' | 'strict2'
  profile: LiquidProfile
  theme: ThemeProviders
}

export const defaultOptions: NormalizedFullOptions = {
  root: ['.'],
  layouts: ['.'],
  partials: ['.'],
  relativeReference: true,
  keyValueSeparator: ':',
  cache: undefined,
  extname: '',
  fs: undefined as unknown as FS,
  dateFormat: '%A, %B %-e, %Y at %-l:%M %P %z',
  locale: '',
  trimTagRight: false,
  trimTagLeft: false,
  trimOutputRight: false,
  trimOutputLeft: false,
  greedy: true,
  bugCompatibleWhitespaceTrimming: false,
  tagDelimiterLeft: '{%',
  tagDelimiterRight: '%}',
  outputDelimiterLeft: '{{',
  outputDelimiterRight: '}}',
  strictFilters: false,
  strictVariables: false,
  renderErrors: 'raise',
  ownPropertyOnly: true,
  lenientIf: false,
  globals: {},
  operators: defaultOperators,
  parseLimit: Infinity,
  templateLimit: Infinity,
  outputLengthLimit: Infinity,
  assignLimit: Infinity,
  maxDepth: 100,
  maxParseDepth: 128,
  errorMode: 'lax',
  profile: 'core',
  theme: {}
}

export function normalize(options: LiquidOptions): NormalizedFullOptions {
  const limit = options.sourceByteLimit ?? Infinity
  assert(limit === Infinity || (Number.isSafeInteger(limit) && limit >= 0), 'invalid sourceByteLimit')
  if (options.baseUrl !== undefined) new URL(options.baseUrl)
  options = {
    ...options,
    sourceByteLimit: limit,
    fs: options.templates ? new MapFS(options.templates) : (options.fs ?? fs.createFS(options.baseUrl))
  }

  if ('root' in options) {
    if (!('partials' in options)) options.partials = options.root
    if (!('layouts' in options)) options.layouts = options.root
  }
  if ('cache' in options) {
    let cache: LiquidCache | undefined
    if (typeof options.cache === 'number') cache = options.cache > 0 ? new LRU(options.cache) : undefined
    else if (typeof options.cache === 'object') cache = options.cache
    else cache = options.cache ? new LRU(1024) : undefined
    options.cache = cache
  }
  options = { ...defaultOptions, ...options }
  if ((!options.fs!.dirname || !options.fs!.sep) && options.relativeReference) {
    console.warn(
      '[LiquidJS] `fs.dirname` and `fs.sep` are required for relativeReference, set relativeReference to `false` to suppress this warning'
    )
    options.relativeReference = false
  }
  options.root = normalizeDirectoryList(options.root)
  options.partials = normalizeDirectoryList(options.partials)
  options.layouts = normalizeDirectoryList(options.layouts)
  options.outputEscape = options.outputEscape && getOutputEscapeFunction(options.outputEscape)
  if (!options.locale) {
    options.locale = getDateTimeFormat()?.().resolvedOptions().locale ?? 'en-US'
  }
  if (options.templates) {
    options.fs = new MapFS(options.templates)
    options.relativeReference = true
    options.root = options.partials = options.layouts = '.'
  }
  assert(
    isFunction(options.fs?.readFile) && isFunction(options.fs?.exists) && isFunction(options.fs?.resolve),
    'fs requires readFile, exists, and resolve methods'
  )
  return options as NormalizedFullOptions
}

function getOutputEscapeFunction(nameOrFunction: OutputEscapeOption): OutputEscape {
  if (nameOrFunction === 'escape') return escape
  if (nameOrFunction === 'json') return json
  assert(isFunction(nameOrFunction), '`outputEscape` need to be of type string or function')
  return nameOrFunction
}

export function normalizeDirectoryList(value: any): string[] {
  let list: string[] = []
  if (isArray(value)) list = value
  if (isString(value)) list = [value]
  return list
}
