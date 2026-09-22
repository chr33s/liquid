import { Operation, associate, drive, operationFor, existingOperation } from '../util'
import { Drop } from '../drop/drop'
import { NormalizedFullOptions, defaultOptions, RenderOptions } from '../liquid-options'
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
  toValue,
  readArrayElement
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
  private readonly lookupSignal?: AbortSignal
  public get signal() {
    return this.operation.signal
  }
  public get operationOptions() {
    return associate({ signal: this.signal }, this.operation)
  }
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
  public ownPropertyOnly: boolean
  public templateLimit: Limiter
  public outputLengthLimit: Limiter
  public depthLimit: Limiter
  public constructor(
    env: object = {},
    opts: NormalizedFullOptions = defaultOptions,
    renderOptions: RenderOptions = {},
    {
      templateLimit,
      outputLengthLimit,
      depthLimit
    }: { templateLimit?: Limiter; outputLengthLimit?: Limiter; depthLimit?: Limiter } = {}
  ) {
    this.operationActive = !!existingOperation(renderOptions)
    this.lookupSignal = renderOptions.signal
    this.operation = this.operationActive ? operationFor(renderOptions) : new Operation()
    this.opts = opts
    this.globals = renderOptions.globals ?? opts.globals
    this.environments = isObject(env) ? env : Object(env)
    this.strictVariables = renderOptions.strictVariables ?? this.opts.strictVariables
    this.ownPropertyOnly = renderOptions.ownPropertyOnly ?? opts.ownPropertyOnly
    this.templateLimit = templateLimit ?? new Limiter('template', renderOptions.templateLimit ?? opts.templateLimit)
    this.outputLengthLimit =
      outputLengthLimit ?? new Limiter('output length', renderOptions.outputLengthLimit ?? opts.outputLengthLimit)
    this.depthLimit = depthLimit ?? new Limiter('template depth', opts.maxDepth)
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
    return [this.globals, this.environments, ...this.scopes].reduce((ctx, val) => Object.assign(ctx, val), {})
  }
  public get(paths: PropertyKey[]): Promise<unknown> {
    return this.lookup(this._get(paths))
  }
  private async lookup(value: IterableIterator<unknown>): Promise<unknown> {
    if (this.operationActive) return drive(value, this.operation)
    const previous = this.operation
    const owner = new Operation(this.lookupSignal)
    this.operation = owner
    this.operationActive = true
    try {
      const result = await drive(value, owner)
      owner.check()
      return result
    } finally {
      owner.finish()
      this.operation = previous
      this.operationActive = false
    }
  }
  public *_get(paths: (PropertyKey | Drop)[]): IterableIterator<unknown> {
    const scope = this.findScope(paths[0] as string) // first prop should always be a string
    return yield this._getFromScope(scope, paths)
  }
  public getFromScope(scope: unknown, paths: PropertyKey[] | string): Promise<unknown> {
    return this.lookup(this._getFromScope(scope, paths))
  }
  public *_getFromScope(
    scope: unknown,
    paths: (PropertyKey | Drop)[] | string,
    strictVariables = this.strictVariables
  ): IterableIterator<unknown> {
    if (isString(paths)) paths = paths.split('.')
    for (let i = 0; i < paths.length; i++) {
      scope = yield this.readProperty(scope as object, paths[i])
      if (strictVariables && isUndefined(scope)) {
        throw new InternalUndefinedVariableError((paths as string[]).slice(0, i + 1).join!('.'))
      }
    }
    return scope
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
        ownPropertyOnly: this.ownPropertyOnly
      },
      {
        templateLimit: this.templateLimit,
        outputLengthLimit: this.outputLengthLimit,
        depthLimit: this.depthLimit
      }
    )
    child.operation.finish()
    child.operation = this.operation
    child.operationActive = this.operationActive
    return child
  }
  private findScope(key: string | number) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const candidate = this.scopes[i]
      if (this.ownPropertyOnly ? hasOwnProperty.call(candidate, key) : key in candidate) return candidate
    }
    if (this.ownPropertyOnly ? hasOwnProperty.call(this.environments, key) : key in this.environments)
      return this.environments
    return this.globals
  }
  readProperty(obj: Scope, key: PropertyKey | Drop) {
    if (this.operationActive) this.operation.check()
    obj = toLiquid(obj)
    key = toValue(key) as PropertyKey
    if (isNil(obj)) return obj
    if (isArray(obj) && isNumber(key)) return readArrayElement(obj, key, this.ownPropertyOnly)
    const value = readJSProperty(obj, key, this.ownPropertyOnly)
    if (value === undefined && obj instanceof Drop) return obj.liquidMethodMissing(key, this)
    if (isFunction(value)) return value.call(obj)
    if (key === 'size') return this.readSize(obj)
    else if (key === 'first') return this.readFirst(obj)
    else if (key === 'last') return this.readLast(obj)
    return value
  }
  private readFirst(obj: Scope) {
    if (isArray(obj)) return readArrayElement(obj, 0, this.ownPropertyOnly)
    return readJSProperty(obj, 'first', this.ownPropertyOnly)
  }
  private readLast(obj: Scope) {
    if (isArray(obj)) return readArrayElement(obj, -1, this.ownPropertyOnly)
    return readJSProperty(obj, 'last', this.ownPropertyOnly)
  }
  private readSize(obj: Scope) {
    if (hasOwnProperty.call(obj, 'size')) return obj['size']
    if (!this.ownPropertyOnly && obj['size'] !== undefined) return obj['size']
    if (isArray(obj) || isString(obj)) return obj.length
    if (obj instanceof Map || obj instanceof Set) return obj.size
    if (typeof obj === 'object') return Object.keys(obj).length
  }
}

export function readJSProperty(obj: Scope, key: PropertyKey, ownPropertyOnly: boolean) {
  if (BLOCKED_SCOPE_KEYS.has(key) && ownPropertyOnly) return undefined
  if (ownPropertyOnly && !hasOwnProperty.call(obj, key) && !(obj instanceof Drop)) return undefined
  return obj[key]
}
