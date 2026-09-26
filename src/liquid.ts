import { Operation, type OperationOptions } from './util/operation'
import { drive as execute, driving, operate } from './util/async'
import { StreamedEmitter, type Emitter } from './emitters'
import { Context } from './context'
import { forOwn, isString, strictUniq } from './util'
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
import { tags } from './tags'
import { filters } from './filters'
import {
  LiquidOptions,
  normalizeDirectoryList,
  NormalizedFullOptions,
  normalize,
  RenderOptions,
  RenderFileOptions
} from './liquid-options'

/**
 * Liquid template engine.
 *
 * Caller API: `parse`, `render`, `parseAndRender`, `parseFile`, `renderFile`, `renderToStream`, `renderFileToStream`, `evalValue`, `analyze`, `parseAndAnalyze`, the variable projection methods, `registerTag`, `registerFilter`, `unregisterTag`, `unregisterFilter`, `plugin`, and `express`.
 * `analyze()` returns the {@link StaticAnalysis} contract. The variable methods are projections of that result.
 *
 * Extension protocol: the generator methods (`_render`, `_parseAndRender`, `_parseFile`, `_parsePartialFile`, `_parseLayoutFile`, `_renderFile`, `_evalValue`), {@link Tag}, {@link FS}, and {@link Emitter}. Tags, filters, and filesystem methods may return a value, a Promise, or a generator.
 * Rendering the same {@link Context} again is not a retry: `assign`, `increment`, and `decrement` mutate that scope.
 */
export class Liquid {
  /** @internal */
  readonly pendingLoads = new Map<string, Promise<Template[]>>()
  public readonly options: NormalizedFullOptions
  /** Unstable. Not part of the supported caller or extension API. */
  public readonly renderer = new Render()
  /**
   * @deprecated will be removed. Custom tags receive the parser as the fourth constructor argument, not from this field.
   */
  public readonly parser: Parser
  public readonly filters: Record<string, FilterImplOptions> = Object.create(null)
  public readonly tags: Record<string, TagClass> = Object.create(null)
  private expressConfigured = false

  public constructor(opts: LiquidOptions = {}) {
    this.options = normalize(opts)
    // eslint-disable-next-line deprecation/deprecation
    this.parser = new Parser(this)
    forOwn(tags, (conf: TagClass, name: string) => this.registerTag(name, conf))
    forOwn(filters, (handler: FilterImplOptions, name: string) => this.registerFilter(name, handler))
  }
  public parse(html: string, filepath?: string): Template[] {
    const parser = new Parser(this)
    return parser.parse(html, filepath)
  }

  /** Extension protocol. Generator form of `render`. */
  public *_render(
    tpl: Template[],
    scope: Context | object | undefined,
    renderOptions: RenderOptions = {},
    emitter?: Emitter
  ): IterableIterator<any> {
    const ctx = scope instanceof Context ? scope : new Context(scope, this.options, renderOptions)
    const owner = driving()
    if (!owner?.covers(renderOptions.signal)) {
      return yield operate(renderOptions, () => this._render(tpl, ctx, renderOptions, emitter), owner)
    }
    if (emitter instanceof StreamedEmitter) emitter.outputLengthLimit = ctx.outputLengthLimit
    return yield ctx.bind(owner, this.renderer.renderTemplates(tpl, ctx, emitter))
  }
  public async render(tpl: Template[], scope?: Context | object, renderOptions?: RenderOptions): Promise<string> {
    return rendered(await this.run(renderOptions, options => this._render(tpl, scope, options), scope))
  }

  /** Extension protocol. Generator form of `parseAndRender`. */
  public _parseAndRender(
    html: string,
    scope: Context | object | undefined,
    renderOptions: RenderOptions
  ): IterableIterator<any> {
    const tpl = this.parse(html)
    return this._render(tpl, scope, renderOptions)
  }
  public async parseAndRender(html: string, scope?: Context | object, renderOptions?: RenderOptions): Promise<string> {
    return rendered(await this.run(renderOptions, options => this._parseAndRender(html, scope, options), scope))
  }

  /** Extension protocol. Generator form of parsing a partial. */
  public _parsePartialFile(file: string, currentFile?: string, options?: OperationOptions) {
    return new Parser(this).parseFile(file, LookupType.Partials, currentFile, options)
  }
  /** Extension protocol. Generator form of parsing a layout. */
  public _parseLayoutFile(file: string, currentFile?: string, options?: OperationOptions) {
    return new Parser(this).parseFile(file, LookupType.Layouts, currentFile, options)
  }
  /** Extension protocol. Generator form of `parseFile`. */
  public _parseFile(file: string, lookupType?: LookupType, currentFile?: string, options?: OperationOptions) {
    return new Parser(this).parseFile(file, lookupType, currentFile, options)
  }
  public async parseFile(file: string, lookupType?: LookupType, options?: OperationOptions): Promise<Template[]> {
    return this.run(options, options => this._parseFile(file, lookupType, undefined, options))
  }
  /** Extension protocol. Generator form of `renderFile`. */
  public *_renderFile(
    file: string,
    ctx: Context | object | undefined,
    renderFileOptions: RenderFileOptions
  ): Generator<any> {
    const templates = (yield this._parseFile(
      file,
      renderFileOptions.lookupType,
      undefined,
      renderFileOptions
    )) as Template[]
    return yield this._render(templates, ctx, renderFileOptions)
  }
  public async renderFile(
    file: string,
    ctx?: Context | object,
    renderFileOptions?: RenderFileOptions
  ): Promise<string> {
    return rendered(await this.run(renderFileOptions, options => this._renderFile(file, ctx, options), ctx))
  }

  /** Extension protocol. Generator form of `evalValue`. */
  public *_evalValue(str: string, scope?: object | Context, options: OperationOptions = {}): IterableIterator<any> {
    const ctx = scope instanceof Context ? scope : new Context(scope, this.options)
    const owner = driving()
    if (!owner?.covers(options.signal)) return yield operate(options, () => this._evalValue(str, ctx, options), owner)
    return yield ctx.bind(owner, new Value(str, this).value(ctx))
  }
  public async evalValue(str: string, scope?: object | Context, options?: OperationOptions): Promise<unknown> {
    return this.run(options, options => this._evalValue(str, scope, options), scope)
  }

  private run<T, O extends OperationOptions>(
    options: O | undefined,
    task: (options: O) => Generator<unknown, T> | IterableIterator<T>,
    scope?: object
  ): Promise<T> {
    const parent = driving() ?? (scope instanceof Context ? scope.operation : undefined)
    return operate(options ?? ({} as O), task, parent)
  }

  public renderToStream(
    templates: Template[],
    scope?: Context | object,
    options: RenderOptions = {}
  ): ReadableStream<string> {
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
        await execute(this._render(templates, scope, { ...options, signal: owner.signal }, emitter) as Generator, owner)
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
    scope?: Context | object,
    options: RenderFileOptions = {}
  ): Promise<ReadableStream<string>> {
    const owner = new Operation(options.signal)
    try {
      owner.check()
      const templates = await execute(
        this._parseFile(file, options.lookupType, undefined, { ...options, signal: owner.signal }),
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
  public unregisterTag(name: string) {
    delete this.tags[name]
  }
  public plugin(plugin: (this: Liquid, L: typeof Liquid) => void) {
    return plugin.call(this, Liquid)
  }
  /**
   * Express view callback. The first call prepends that view's `root` onto this engine's `root`, `layouts`, and `partials`.
   * Later renders on this engine, including `renderFile()`, use those paths. The object passed to the constructor is not modified.
   */
  public express() {
    const options = this.options
    const renderFile = this.renderFile.bind(this)
    const configure = (root: unknown) => {
      if (this.expressConfigured) return
      this.expressConfigured = true
      const dirs = normalizeDirectoryList(root)
      options.root = [...dirs, ...options.root]
      options.layouts = [...dirs, ...options.layouts]
      options.partials = [...dirs, ...options.partials]
    }

    return function (
      this: { root?: string | string[] },
      filePath: string,
      ctx: object,
      callback: (err: Error | null, rendered?: string) => void
    ) {
      configure(this.root)
      renderFile(filePath, ctx).then(
        html => callback(null, html),
        error => callback(error instanceof Error ? error : new Error(String(error)))
      )
    }
  }

  /**
   * Analysis contract. `variables`, `fullVariables`, `variableSegments`, `globalVariables`, `globalFullVariables`, and `globalVariableSegments` are projections of this result.
   */
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

  private async variableMap(
    template: string | Template[],
    options: StaticAnalysisOptions,
    select: 'variables' | 'globals'
  ) {
    options.signal?.throwIfAborted()
    const analysis = await analyze(isString(template) ? this.parse(template) : template, options)
    return analysis[select]
  }

  /** Return an array of all variables without their properties. */
  public async variables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    return Object.keys(await this.variableMap(template, options, 'variables'))
  }

  /** Return an array of all variables including their properties/paths. */
  public async fullVariables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    const variables = await this.variableMap(template, options, 'variables')
    return Array.from(new Set(Object.values(variables).flatMap(entries => entries.map(entry => String(entry)))))
  }

  /** Return an array of all variables, each as an array of properties/segments. */
  public async variableSegments(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<Array<SegmentArray>> {
    const variables = await this.variableMap(template, options, 'variables')
    return Array.from(strictUniq(Object.values(variables).flatMap(entries => entries.map(entry => entry.toArray()))))
  }

  /** Return an array of all expected context variables without their properties. */
  public async globalVariables(template: string | Template[], options: StaticAnalysisOptions = {}): Promise<string[]> {
    return Object.keys(await this.variableMap(template, options, 'globals'))
  }

  /** Return an array of all expected context variables including their properties/paths. */
  public async globalFullVariables(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<string[]> {
    const variables = await this.variableMap(template, options, 'globals')
    return Array.from(new Set(Object.values(variables).flatMap(entries => entries.map(entry => String(entry)))))
  }

  /** Return an array of all expected context variables, each as an array of properties/segments. */
  public async globalVariableSegments(
    template: string | Template[],
    options: StaticAnalysisOptions = {}
  ): Promise<Array<SegmentArray>> {
    const variables = await this.variableMap(template, options, 'globals')
    return Array.from(strictUniq(Object.values(variables).flatMap(entries => entries.map(entry => entry.toArray()))))
  }
}

function rendered(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
