import { Operation, associate, existingOperation, operationFor, type OperationOptions } from './util/operation'
import { drive as execute } from './util/async'
import { StreamedEmitter, type Emitter } from './emitters'
import { Context } from './context'
import { forOwn, isString, strictUniq, LiquidError, inlineErrorMessage } from './util'
import {
  TagClass,
  FilterImplOptions,
  Template,
  Value,
  StaticAnalysisOptions,
  StaticAnalysis,
  analyze,
  SegmentArray
} from './template'
import { LookupType } from './fs/loader'
import { Render } from './render'
import { Parser } from './parser'
import { tags, hostedTags } from './tags'
import { filters } from './filters'
import { hostedFilters } from './filters/hosted'
import { isHosted, renderThemeTemplates } from './theme'
import {
  LiquidOptions,
  normalizeDirectoryList,
  NormalizedFullOptions,
  normalize,
  RenderOptions,
  RenderFileOptions
} from './liquid-options'

export class Liquid {
  /** @internal */
  readonly pendingLoads = new Map<string, Promise<Template[]>>()
  public readonly options: NormalizedFullOptions
  public readonly renderer = new Render()
  /**
   * @deprecated will be removed. In tags use `this.parser` instead
   */
  public readonly parser: Parser
  public readonly filters: Record<string, FilterImplOptions> = Object.create(null)
  public readonly tags: Record<string, TagClass> = Object.create(null)
  /**
   * Syntax warnings collected while parsing under `errorMode: "warn"`.
   */
  public readonly warnings: string[] = []

  public constructor(opts: LiquidOptions = {}) {
    this.options = normalize(opts)
    // eslint-disable-next-line deprecation/deprecation
    this.parser = new Parser(this)
    forOwn(tags, (conf: TagClass, name: string) => this.registerTag(name, conf))
    forOwn(filters, (handler: FilterImplOptions, name: string) => this.registerFilter(name, handler))
    if (isHosted(this.options.profile)) {
      forOwn(hostedTags, (conf: TagClass, name: string) => this.registerTag(name, conf))
      forOwn(hostedFilters, (handler: FilterImplOptions, name: string) => this.registerFilter(name, handler))
    }
  }
  public parse(html: string, filepath?: string): Template[] {
    const parser = new Parser(this)
    return parser.parse(html, filepath)
  }

  public *_render(
    tpl: Template[],
    scope: Context | object | undefined,
    renderOptions: RenderOptions = {},
    emitter?: Emitter
  ): IterableIterator<any> {
    const ctx = scope instanceof Context ? scope : new Context(scope, this.options, renderOptions)
    const joined = ctx.operationActive && ctx.operation === existingOperation(renderOptions)
    const previous = ctx.operation
    const wasActive = ctx.operationActive
    ctx.operationActive = true
    ctx.operation = operationFor(renderOptions)
    try {
      if (emitter instanceof StreamedEmitter) emitter.outputLengthLimit = ctx.outputLengthLimit
      return yield renderThemeTemplates(this, tpl, ctx, emitter)
    } catch (e) {
      ctx.operation.check()
      if (ctx.renderErrors !== 'inline' || !LiquidError.is(e)) throw e
      ctx.onError?.(e)
      const message = inlineErrorMessage(e)
      if (emitter) yield emitter.write(message)
      return message
    } finally {
      if (!joined) {
        ctx.operation = previous
        ctx.operationActive = wasActive
      }
    }
  }
  public async render(tpl: Template[], scope?: object, renderOptions?: RenderOptions): Promise<any> {
    return this.run(renderOptions, options => this._render(tpl, scope, options), scope)
  }

  public _parseAndRender(
    html: string,
    scope: Context | object | undefined,
    renderOptions: RenderOptions
  ): IterableIterator<any> {
    const tpl = this.parse(html)
    return this._render(tpl, scope, renderOptions)
  }
  public async parseAndRender(html: string, scope?: Context | object, renderOptions?: RenderOptions): Promise<any> {
    return this.run(renderOptions, options => this._parseAndRender(html, scope, options), scope)
  }

  public _parsePartialFile(file: string, currentFile?: string, options?: OperationOptions & { tenant?: string }) {
    return new Parser(this).parseFile(file, LookupType.Partials, currentFile, options)
  }
  public _parseLayoutFile(file: string, currentFile?: string, options?: OperationOptions & { tenant?: string }) {
    return new Parser(this).parseFile(file, LookupType.Layouts, currentFile, options)
  }
  public _parseFile(
    file: string,
    lookupType?: LookupType,
    currentFile?: string,
    options?: OperationOptions & { tenant?: string }
  ) {
    return new Parser(this).parseFile(file, lookupType, currentFile, options)
  }
  public async parseFile(
    file: string,
    lookupType?: LookupType,
    options?: OperationOptions & { tenant?: string }
  ): Promise<Template[]> {
    return this.run(options, options => this._parseFile(file, lookupType, undefined, options))
  }
  public *_renderFile(
    file: string,
    ctx: Context | object | undefined,
    renderFileOptions: RenderFileOptions
  ): Generator<any> {
    const templates = (yield this._parseFile(
      file,
      renderFileOptions.lookupType,
      undefined,
      associate(
        { ...renderFileOptions, tenant: ctx instanceof Context ? ctx.theme.tenant : renderFileOptions.theme?.tenant },
        operationFor(renderFileOptions)
      )
    )) as Template[]
    return yield this._render(templates, ctx, renderFileOptions)
  }
  public async renderFile(file: string, ctx?: Context | object, renderFileOptions?: RenderFileOptions) {
    return this.run(renderFileOptions, options => this._renderFile(file, ctx, options), ctx)
  }

  public *_evalValue(str: string, scope?: object | Context, options: OperationOptions = {}): IterableIterator<any> {
    const value = new Value(str, this)
    const ctx = scope instanceof Context ? scope : new Context(scope, this.options)
    if (ctx.operationActive && ctx.operation === existingOperation(options)) return yield value.value(ctx)
    const previous = ctx.operation
    const wasActive = ctx.operationActive
    ctx.operationActive = true
    ctx.operation = operationFor(options)
    try {
      return yield value.value(ctx)
    } finally {
      ctx.operation = previous
      ctx.operationActive = wasActive
    }
  }
  public async evalValue(str: string, scope?: object | Context, options?: OperationOptions): Promise<any> {
    return this.run(options, options => this._evalValue(str, scope, options), scope)
  }

  private async run<T, O extends OperationOptions>(
    options: O | undefined,
    task: (options: O) => Generator<unknown, T> | IterableIterator<T>,
    scope?: object
  ): Promise<T> {
    const active =
      scope instanceof Context && scope.operationActive ? scope.operation : existingOperation(options ?? {})
    const owner = active ?? new Operation(options?.signal)
    const owned = associate({ ...options, signal: owner.signal } as O, owner)
    if (active) return owner.join(execute(task(owned) as Generator<unknown, T>, owner))
    try {
      owner.check()
      const result = await execute(task(owned) as Generator<unknown, T>, owner)
      owner.check()
      return result
    } finally {
      await owner.drain()
      owner.finish()
    }
  }

  public renderToStream(templates: Template[], scope?: object, options: RenderOptions = {}): ReadableStream<string> {
    try {
      return this.stream(templates, scope, options, new Operation(options.signal))
    } catch (error) {
      return new ReadableStream({
        start(controller) {
          controller.error(error)
        }
      })
    }
  }

  private stream(
    templates: Template[],
    scope: object | undefined,
    options: RenderOptions,
    owner: Operation
  ): ReadableStream<string> {
    const emitter = new StreamedEmitter(owner)
    const abort = () => emitter.error(owner.signal.reason)
    owner.signal.addEventListener('abort', abort, { once: true })
    if (owner.signal.aborted) abort()
    emitter.completion = Promise.resolve()
      .then(async () => {
        owner.check()
        await execute(
          this._render(templates, scope, associate({ ...options, signal: owner.signal }, owner), emitter) as Generator,
          owner
        )
        await emitter.end()
      })
      .catch(error => {
        emitter.error(owner.signal.aborted ? owner.signal.reason : error)
      })
      .finally(async () => {
        await owner.drain()
        owner.signal.removeEventListener('abort', abort)
        owner.finish()
      })
    return emitter.stream
  }

  public async renderFileToStream(
    file: string,
    scope?: object,
    options: RenderFileOptions = {}
  ): Promise<ReadableStream<string>> {
    const owner = new Operation(options.signal)
    try {
      owner.check()
      const templates = await execute(
        this._parseFile(
          file,
          options.lookupType,
          undefined,
          associate(
            {
              ...options,
              signal: owner.signal,
              tenant: scope instanceof Context ? scope.theme.tenant : options.theme?.tenant
            },
            owner
          )
        ),
        owner
      )
      return this.stream(templates, scope, options, owner)
    } catch (error) {
      owner.finish()
      throw error
    }
  }

  public registerFilter(name: string, filter: FilterImplOptions) {
    this.filters[name] = filter
  }
  public unregisterFilter(name: string) {
    delete this.filters[name]
  }
  public registerTag(name: string, tag: TagClass) {
    this.tags[name] = tag
  }
  public plugin(plugin: (this: Liquid, L: typeof Liquid) => void) {
    return plugin.call(this, Liquid)
  }
  public express() {
    const self = this // eslint-disable-line
    let firstCall = true

    return function (
      this: any,
      filePath: string,
      ctx: object,
      callback: (err: Error | null, rendered: string) => void
    ) {
      if (firstCall) {
        firstCall = false
        const dirs = normalizeDirectoryList(this.root)
        self.options.root.unshift(...dirs)
        self.options.layouts.unshift(...dirs)
        self.options.partials.unshift(...dirs)
      }
      self.renderFile(filePath, ctx).then(html => callback(null, html) as any, callback as any)
    }
  }

  public async analyze(template: Template[], options: StaticAnalysisOptions = {}): Promise<StaticAnalysis> {
    return analyze(template, options)
  }

  public async parseAndAnalyze(
    html: string,
    filename?: string,
    options: StaticAnalysisOptions = {}
  ): Promise<StaticAnalysis> {
    options.signal?.throwIfAborted()
    return analyze(this.parse(html, filename), options)
  }

  /** Return an array of all variables without their properties. */
  public async variables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Object.keys(analysis.variables)
  }

  /** Return an array of all variables without their properties. */

  /** Return an array of all variables including their properties/paths. */
  public async fullVariables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Array.from(new Set(Object.values(analysis.variables).flatMap(a => a.map(v => String(v)))))
  }

  /** Return an array of all variables including their properties/paths. */

  /** Return an array of all variables, each as an array of properties/segments. */
  public async variableSegments(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<Array<SegmentArray>> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Array.from(strictUniq(Object.values(analysis.variables).flatMap(a => a.map(v => v.toArray()))))
  }

  /** Return an array of all variables, each as an array of properties/segments. */

  /** Return an array of all expected context variables without their properties. */
  public async globalVariables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Object.keys(analysis.globals)
  }

  /** Return an array of all expected context variables without their properties. */

  /** Return an array of all expected context variables including their properties/paths. */
  public async globalFullVariables(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<string[]> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Array.from(new Set(Object.values(analysis.globals).flatMap(a => a.map(v => String(v)))))
  }

  /** Return an array of all expected context variables including their properties/paths. */

  /** Return an array of all expected context variables, each as an array of properties/segments. */
  public async globalVariableSegments(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<Array<SegmentArray>> {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return Array.from(strictUniq(Object.values(analysis.globals).flatMap(a => a.map(v => v.toArray()))))
  }

  /** Return an array of all expected context variables, each as an array of properties/segments. */
}
