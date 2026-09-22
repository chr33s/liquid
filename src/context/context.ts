import { Operation, associate, drive, operationFor, existingOperation } from '../util'
import { Drop } from '../drop/drop'
import { SelfDrop } from '../drop/self-drop'
import { FloatDrop, isDecimal } from '../drop/float-drop'
import { CapabilityLog, type ThemeProviders } from '../theme'
import type { FilterImplOptions } from '../template/filter-impl-options'
import { NormalizedFullOptions, defaultOptions, RenderOptions, RenderErrorPolicy } from '../liquid-options'
import { createScope, Scope } from './scope'
import {
  hasOwnProperty,
  isArray,
  isNil,
  isUndefined,
  isString,
  isFunction,
  isNumber,
  toLiquid,
  InternalUndefinedVariableError,
  isObject,
  Limiter,
  LiquidRange,
  toValue,
  readArrayElement,
  LiquidError
} from '../util'

type PropertyKey = string | number

const BLOCKED_SCOPE_KEYS: ReadonlySet<PropertyKey> = new Set(['__proto__', 'constructor', 'prototype'])

export class Context {
  /**
   * insert a Context-level empty scope,
   * for tags like `{% capture %}` `{% assign %}` to operate
   */
  private scopes: Scope[] = [createScope()]
  private registers: Record<string, any> = {}
  /**
   * user passed in scope
   * `{% increment %}`, `{% decrement %}` changes this scope,
   * whereas `{% capture %}`, `{% assign %}` only hide this scope
   */
  public environments: Scope
  /**
   * global scope used as fallback for missing variables
   */
  public globals: Scope
  /** @internal */
  public operation: Operation
  /** @internal */
  public operationActive = false
  private lookupLifetime?: { owner: Operation; previous: Operation; pending: number }
  private readonly lookupSignal?: AbortSignal
  public get signal() {
    return this.operation.signal
  }
  public get operationOptions() {
    return associate({ signal: this.signal, tenant: this.theme.tenant }, this.operation)
  }
  /**
   * Inside a `{% paginate %}` body, including partials rendered from it, the
   * hosted default loop cap does not apply: the page size already bounds it.
   */
  public paginated = false
  public breakCalled = false
  public continueCalled = false
  /**
   * The normalized liquid options object
   */
  public opts: NormalizedFullOptions
  /**
   * Throw when accessing undefined variable?
   */
  public strictVariables: boolean
  /**
   * Throw when a filter is not registered?
   */
  public strictFilters: boolean
  public renderErrors: RenderErrorPolicy
  public onError?: (error: LiquidError) => void
  public ownPropertyOnly: boolean
  /**
   * Filters registered for this render() call only
   */
  public filters?: Record<string, FilterImplOptions>
  /**
   * Data and services the hosted theme dialect renders against
   */
  public theme: ThemeProviders
  /**
   * What this render could and could not do
   */
  public capabilities: CapabilityLog
  public templateLimit: Limiter
  public outputLengthLimit: Limiter
  public assignLimit: Limiter
  public depthLimit: Limiter
  private selfDrop?: Scope
  private readonly themeGlobals: Scope
  public constructor(
    env: object = {},
    opts: NormalizedFullOptions = defaultOptions,
    renderOptions: RenderOptions = {},
    {
      templateLimit,
      outputLengthLimit,
      assignLimit,
      depthLimit,
      capabilities
    }: {
      templateLimit?: Limiter
      outputLengthLimit?: Limiter
      assignLimit?: Limiter
      depthLimit?: Limiter
      capabilities?: CapabilityLog
    } = {}
  ) {
    this.operationActive = !!existingOperation(renderOptions)
    this.lookupSignal = renderOptions.signal
    this.operation = this.operationActive ? operationFor(renderOptions) : new Operation()
    this.opts = opts
    this.globals = renderOptions.globals ?? opts.globals
    this.environments = isObject(env) ? env : Object(env)
    this.strictVariables = renderOptions.strictVariables ?? this.opts.strictVariables
    this.strictFilters = renderOptions.strictFilters ?? this.opts.strictFilters
    this.renderErrors = renderOptions.renderErrors ?? this.opts.renderErrors
    this.onError = renderOptions.onError
    this.filters = renderOptions.filters
    this.theme = renderOptions.theme ?? opts.theme ?? {}
    this.themeGlobals = createScope({
      ...this.theme.store?.globals,
      ...(this.theme.settings === undefined ? {} : { settings: this.theme.settings })
    })
    this.capabilities = capabilities ?? new CapabilityLog()
    this.ownPropertyOnly = renderOptions.ownPropertyOnly ?? opts.ownPropertyOnly
    const ledger = renderOptions.ledger
    this.templateLimit =
      templateLimit ??
      new Limiter('template', renderOptions.templateLimit ?? opts.templateLimit, {
        memory: true,
        cumulative: ledger?.template
      })
    this.outputLengthLimit =
      outputLengthLimit ??
      new Limiter('output length', renderOptions.outputLengthLimit ?? opts.outputLengthLimit, { memory: true })
    this.assignLimit =
      assignLimit ??
      new Limiter('assign', renderOptions.assignLimit ?? opts.assignLimit, { memory: true, cumulative: ledger?.assign })
    if (depthLimit) this.depthLimit = depthLimit
    else {
      // the root scope counts toward the nesting depth, as in the reference
      this.depthLimit = new Limiter('template depth', opts.maxDepth, { message: 'Nesting too deep', recoverable: true })
      if (opts.maxDepth >= 1) this.depthLimit.use(1)
    }
  }
  public getFilter(name: string): FilterImplOptions | undefined {
    // a render-local map is an ordinary object, so `toString` and friends are
    // not filters
    if (!this.filters || !hasOwnProperty.call(this.filters, name)) return undefined
    return this.filters[name]
  }
  public getRegister<T>(key: string, defaultValue: T = undefined as T): T {
    return (this.registers[key] = this.registers[key] || defaultValue)
  }
  public setRegister(key: string, value: any) {
    return (this.registers[key] = value)
  }
  public saveRegister(...keys: string[]): [string, any][] {
    return keys.map(key => [key, this.getRegister(key)])
  }
  public restoreRegister(keyValues: [string, any][]) {
    return keyValues.forEach(([key, value]) => this.setRegister(key, value))
  }
  public getAll() {
    return [this.themeGlobals, this.globals, this.environments, ...this.scopes].reduce(
      (ctx, val) => Object.assign(ctx, val),
      {}
    )
  }
  public get(paths: PropertyKey[]): Promise<unknown> {
    return this.lookup(this._get(paths))
  }
  private async lookup(value: IterableIterator<unknown>): Promise<unknown> {
    if (this.operationActive && !this.lookupLifetime) return this.operation.join(drive(value, this.operation))
    const lifetime = (this.lookupLifetime ??= {
      owner: new Operation(this.lookupSignal),
      previous: this.operation,
      pending: 0
    })
    this.operation = lifetime.owner
    this.operationActive = true
    lifetime.pending++
    try {
      const result = await drive(value, lifetime.owner)
      lifetime.owner.check()
      return result
    } finally {
      if (--lifetime.pending === 0) {
        await lifetime.owner.drain()
        if (lifetime.pending === 0) {
          lifetime.owner.finish()
          this.operation = lifetime.previous
          this.operationActive = false
          this.lookupLifetime = undefined
        }
      }
    }
  }
  public *_get(
    paths: (PropertyKey | Drop)[],
    strictVariables = this.strictVariables,
    bracketed?: boolean[]
  ): IterableIterator<unknown> {
    const scope = this.findScope(paths[0] as string) // first prop should always be a string
    return yield this._getFromScope(scope, paths, strictVariables, bracketed)
  }
  public getFromScope(scope: unknown, paths: PropertyKey[] | string): Promise<unknown> {
    return this.lookup(this._getFromScope(scope, paths))
  }
  public *_getFromScope(
    scope: unknown,
    paths: (PropertyKey | Drop)[] | string,
    strictVariables = this.strictVariables,
    bracketed?: boolean[]
  ): IterableIterator<unknown> {
    if (isString(paths)) paths = paths.split('.')
    for (let i = 0; i < paths.length; i++) {
      scope = yield this.readProperty(scope as object, paths[i], !bracketed?.[i])
      if (strictVariables && isUndefined(scope)) {
        throw new InternalUndefinedVariableError((paths as string[]).slice(0, i + 1).join!('.'))
      }
    }
    return scope
  }
  /**
   * Bind `key` in the bottom scope, charging the assign score for the value.
   * The score only grows: re-binding a key charges the new value again.
   */
  public setBottom(key: string, value: unknown) {
    this.bottom()[key] = value
    if (!this.assignLimit.unlimited) this.assignLimit.use(assignScore(value))
  }
  public push(ctx: Scope): Scope {
    const scope = createScope(ctx)
    this.scopes.push(scope)
    return scope
  }
  public pop() {
    return this.scopes.pop()
  }
  public bottom() {
    return this.scopes[0]
  }
  public spawn(scope = {}) {
    const child = new Context(
      scope,
      this.opts,
      {
        globals: this.globals,
        strictVariables: this.strictVariables,
        strictFilters: this.strictFilters,
        renderErrors: this.renderErrors,
        onError: this.onError,
        filters: this.filters,
        theme: this.theme,
        ownPropertyOnly: this.ownPropertyOnly
      },
      {
        templateLimit: this.templateLimit,
        outputLengthLimit: this.outputLengthLimit,
        assignLimit: this.assignLimit,
        depthLimit: this.depthLimit,
        capabilities: this.capabilities
      }
    )
    child.operation.finish()
    child.operation = this.operation
    child.operationActive = this.operationActive
    child.paginated = this.paginated
    return child
  }
  private findScope(key: string | number) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const candidate = this.scopes[i]
      if (this.ownPropertyOnly ? hasOwnProperty.call(candidate, key) : key in candidate) return candidate
    }
    if (this.ownPropertyOnly ? hasOwnProperty.call(this.environments, key) : key in this.environments)
      return this.environments
    if (this.globals && (this.ownPropertyOnly ? hasOwnProperty.call(this.globals, key) : key in this.globals))
      return this.globals
    if (hasOwnProperty.call(this.themeGlobals, key)) return this.themeGlobals
    if (key === 'self') return this.selfScope()
    return this.globals
  }
  /**
   * `self` resolves to a drop bound to this context, so a SelfDrop handed to a
   * partial still reads the scope it came from. Any user-defined `self` in an
   * enclosing scope wins over it.
   */
  private selfScope(): Scope {
    if (!this.selfDrop) this.selfDrop = { self: new SelfDrop(this) }
    return this.selfDrop
  }
  /** `command`: read `size`, `first` and `last` as the reference's commands, as `a.first` does and `a["first"]` does not. */
  readProperty(obj: Scope, key: PropertyKey | Drop, command = true) {
    if (this.operationActive) this.operation.check()
    obj = toLiquid(obj)
    // an array is indexed by integers only: `a[1.4]` and `a[1.0]` read nothing
    if (isArray(obj) && isDecimal(key)) return undefined
    key = toValue(key) as PropertyKey
    if (isNil(obj)) return obj
    // a range is not a key: `hash[(1..3)]` does not read `hash["1..3"]`
    if ((key as unknown) instanceof LiquidRange) return undefined
    // a string answers `size`, `first` and `last` as commands, but no index
    if (isString(obj)) return command ? readStringCommand(obj as string, key) : undefined
    // an integer answers `size` as its byte size; a number has nothing else
    if (isNumber(obj) || obj instanceof FloatDrop)
      return command && key === 'size' && Number.isInteger(obj) ? 8 : undefined
    if (isArray(obj) && isNumber(key)) return readArrayElement(obj, key, this.ownPropertyOnly)
    // as the reference, an array answers an integer index and its commands, and no other key; `length` is an extension
    if (isArray(obj) && key === 'length') return obj.length
    if (isArray(obj))
      return command && (key === 'size' || key === 'first' || key === 'last') ? this.readCommand(obj, key) : undefined
    if (obj instanceof LiquidRange) return readRangeMember(obj, key)
    if (obj instanceof Drop && obj.hiddenMembers().has(key as string)) return undefined
    const value = readJSProperty(obj, key, this.ownPropertyOnly)
    if (value === undefined && obj instanceof Drop) return obj.liquidMethodMissing(key, this)
    if (isFunction(value)) return value.call(obj)
    if (!command) return value
    if (key === 'size') return this.readSize(obj)
    else if (key === 'first') return this.readFirst(obj)
    else if (key === 'last') return this.readLast(obj)
    return value
  }
  private readCommand(obj: Scope, key: 'size' | 'first' | 'last') {
    return key === 'size' ? this.readSize(obj) : key === 'first' ? this.readFirst(obj) : this.readLast(obj)
  }
  private readFirst(obj: Scope) {
    if (isArray(obj)) return readArrayElement(obj, 0, this.ownPropertyOnly)
    // a hash answers its first entry as a `[key, value]` pair, unless it has a key `first`
    if (isPlainObject(obj) && !hasOwnProperty.call(obj, 'first')) return Object.entries(obj)[0]
    return readJSProperty(obj, 'first', this.ownPropertyOnly)
  }
  private readLast(obj: Scope) {
    if (isArray(obj)) return readArrayElement(obj, -1, this.ownPropertyOnly)
    return readJSProperty(obj, 'last', this.ownPropertyOnly)
  }
  private readSize(obj: Scope) {
    if (obj instanceof LiquidRange) return obj.length
    if (hasOwnProperty.call(obj, 'size')) return obj['size']
    if (!this.ownPropertyOnly && obj['size'] !== undefined) return obj['size']
    if (isArray(obj) || isString(obj)) return obj.length
    if (obj instanceof Map || obj instanceof Set) return obj.size
    if (typeof obj === 'object') return Object.keys(obj).length
  }
}

/**
 * The reference engine's assign score of a value: a string's UTF-8 byte
 * length, one for an array or hash plus the score of what it holds, and one
 * for anything else. A container reached again through a cycle scores one.
 */
function assignScore(value: unknown, seen = new Set<object>()): number {
  const resolved = toValue(value)
  if (isString(resolved)) return utf8Length(resolved)
  if (!isArray(resolved) && !isPlainObject(resolved)) return 1
  if (seen.has(resolved)) return 1
  seen.add(resolved)
  let score = 1
  if (isArray(resolved)) {
    for (const item of resolved) score += assignScore(item, seen)
  } else {
    for (const [key, item] of Object.entries(resolved)) score += utf8Length(key) + assignScore(item, seen)
  }
  return score
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function utf8Length(str: string): number {
  let length = str.length
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      length += 2
      i++
    } else if (code >= 0x800) length += 2
    else if (code >= 0x80) length += 1
  }
  return length
}

/**
 * A range answers the members a materialized array would, and nothing of its
 * own representation.
 */
function readRangeMember(range: LiquidRange, key: PropertyKey | Drop) {
  if (isNumber(key)) return range.at(key)
  if (key === 'size') return range.length
  if (key === 'first') return range.at(0)
  if (key === 'last') return range.at(-1)
  return undefined
}

export function readJSProperty(obj: Scope, key: PropertyKey, ownPropertyOnly: boolean) {
  if (BLOCKED_SCOPE_KEYS.has(key) && ownPropertyOnly) return undefined
  if (ownPropertyOnly && !hasOwnProperty.call(obj, key) && !(obj instanceof Drop)) return undefined
  return obj[key]
}

function readStringCommand(str: string, key: PropertyKey | Drop) {
  if (key === 'size') return [...str].length
  if (key === 'first') return [...str][0] ?? ''
  if (key === 'last') return [...str].pop() ?? ''
}
