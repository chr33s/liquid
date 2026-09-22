#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { FloatDrop, Liquid, LiquidError, ResourceLedger, type RenderOptions, type Template } from '@chr33s/liquid'

type Json = Record<string, any>
type FilterContext = { context: { get(path: string[]): Promise<unknown> } }
type ErrorMode = 'strict2' | 'strict' | 'lax'

const ERROR_MODES: ReadonlySet<string> = new Set(['strict2', 'strict', 'lax'])
const PROFILE = process.env.LIQUID_SPEC_PROFILE === 'shopify_theme' ? 'shopify_theme' : 'core'
const templates = new Map<string, { engine: Liquid; template: Template[] }>()
let nextTemplateId = 1

class ProtocolError extends Error {
  code: number
  data?: Json
  constructor(code: number, message: string, data?: Json) {
    super(message)
    this.code = code
    this.data = data
  }
}

function templateName(name: string) {
  const key = name.toLowerCase()
  return key.endsWith('.liquid') ? key : `${key}.liquid`
}

function fixtureFS(files: Json) {
  const mapping = new Map<string, string>()
  for (const [name, content] of Object.entries(files)) mapping.set(templateName(name), String(content))
  return {
    sep: '/',
    // the fixture filesystem reports a missing file itself, when it is read
    exists: async () => true,
    readFile: async (file: string) => read(file),
    resolve: (_dir: string, file: string) => file
  }
  function read(file: string) {
    const content = mapping.get(templateName(file))
    if (content === undefined) throw Object.assign(new Error(`Could not find asset ${file}`), { code: 'ENOENT' })
    return content
  }
}

function describe(err: LiquidError, type: 'parse_error' | 'render_error') {
  let cause: Error = err
  while (LiquidError.is(cause) && cause.originalError) cause = cause.originalError
  const message = LiquidError.is(cause) ? cause.summary : cause.message
  return { type, message, line: err.token.getPosition()[0] }
}

function compile(params: Json) {
  if (typeof params.template !== 'string') {
    throw new ProtocolError(-32602, "Missing required parameter 'template' in compile request")
  }
  const options: Json = params.options ?? {}
  const mode: ErrorMode = options.error_mode ?? 'strict2'
  if (!ERROR_MODES.has(mode)) {
    throw new ProtocolError(-32602, 'Invalid params', {
      param: 'options.error_mode',
      message: `Expected 'strict2', 'strict' or 'lax', got '${mode}'`
    })
  }
  const engine = new Liquid({
    errorMode: mode,
    profile: PROFILE,
    fs: fixtureFS(params.filesystem ?? {}),
    relativeReference: false
  })
  if (PROFILE === 'shopify_theme') registerHarnessFilters(engine)
  try {
    const template = engine.parse(params.template)
    const id = `tmpl_${nextTemplateId++}`
    templates.set(id, { engine, template })
    return { template_id: id }
  } catch (e) {
    if (!LiquidError.is(e)) throw e
    return { template_id: null, error: describe(e, 'parse_error') }
  }
}

/** liquid-spec's test filters (`lib/liquid/spec/test_filters.rb`), which the recorded Shopify fixtures call. */
function registerHarnessFilters(engine: Liquid) {
  const translate = (key: unknown, ...options: unknown[]) => {
    const slug = options.map(option => (Array.isArray(option) ? option.join('-') : String(option))).join('-')
    return `translated-${key ?? ''}-${slug}`
  }
  engine.registerFilter('t', translate)
  engine.registerFilter('translate', translate)
  engine.registerFilter('read_current_tags', function (this: FilterContext) {
    return this.context.get(['current_tags'])
  })
  engine.registerFilter('read_template', function (this: FilterContext) {
    return this.context.get(['template'])
  })
}

function withClock<T>(currentTime: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (currentTime === undefined) return fn()
  const frozen = Date.parse(currentTime)
  const now = Date.now
  Date.now = () => frozen
  return fn().finally(() => {
    Date.now = now
  })
}

async function render(params: Json) {
  const compiled = templates.get(params.template_id)
  if (!compiled) {
    throw new ProtocolError(-32602, `Unknown template_id '${params.template_id}'. Call compile first.`)
  }
  const options: Json = params.options ?? {}
  const limits: Json = options.resource_limits ?? {}
  const strictErrors = options.strict_errors !== false
  const errors: Json[] = []
  const renderOptions: RenderOptions = {
    globals: params.environment ?? {},
    renderErrors: strictErrors ? 'raise' : 'inline',
    onError: e => errors.push(describe(e, 'render_error')),
    templateLimit: limits.render_score_limit ?? undefined,
    assignLimit: limits.assign_score_limit ?? undefined,
    outputLengthLimit: limits.render_length_limit ?? undefined,
    ledger: new ResourceLedger({
      templateLimit: limits.cumulative_render_score_limit ?? undefined,
      assignLimit: limits.cumulative_assign_score_limit ?? undefined
    })
  }
  try {
    const output = await withClock(options.registers?.current_time, () =>
      compiled.engine.render(compiled.template, {}, renderOptions)
    )
    return { output, errors }
  } catch (e) {
    if (!LiquidError.is(e)) throw e
    const error = describe(e, 'render_error')
    const file = e.token.file ? `${e.token.file} ` : ''
    throw new ProtocolError(-32001, `Liquid error (${file}line ${error.line})`, error)
  }
}

async function dispatch(method: string, params: Json) {
  switch (method) {
    case 'initialize':
      return { version: '1.0', implementation: '@chr33s/liquid', liquid_version: '12.0.0', features: [] }
    case 'compile':
      return compile(params)
    case 'render':
      return render(params)
    default:
      throw new ProtocolError(-32601, `Method not found: ${method}`)
  }
}

/** JSON keeps a number's kind in its source text: `0.0` is a Liquid Float, `0` an Integer. */
function readNumberKind(_key: string, value: unknown, context?: { source?: string }) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return value
  const source = context?.source ?? ''
  if (/[.eE]/.test(source)) return new FloatDrop(value)
  // and an integer keeps digits a double cannot hold
  return Number.isSafeInteger(value) ? value : BigInt(source)
}

function send(message: Json) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n')
}

const lines = createInterface({ input: process.stdin })
let queue = Promise.resolve()
lines.on('line', line => {
  queue = queue.then(() => handle(line))
})

async function handle(line: string) {
  if (!line.trim()) return
  let request: Json
  try {
    request = JSON.parse(line, readNumberKind)
  } catch {
    return send({ id: null, error: { code: -32700, message: 'Parse error' } })
  }
  if (request.method === 'quit') process.exit(0)
  if (typeof request.method !== 'string') {
    return send({ id: request.id ?? null, error: { code: -32600, message: 'Invalid request' } })
  }
  try {
    const result = await dispatch(request.method, request.params ?? {})
    if (request.id !== undefined) send({ id: request.id, result })
  } catch (e) {
    const err =
      e instanceof ProtocolError
        ? e
        : new ProtocolError(-32603, 'Internal error', { message: String((e as Error)?.stack ?? e) })
    process.stderr.write(`${request.method}: ${err.message} ${JSON.stringify(err.data ?? {})}\n`)
    send({ id: request.id ?? null, error: { code: err.code, message: err.message, data: err.data } })
  }
}
