#!/usr/bin/env node
/**
 * Differential testing against the pinned reference engine: renders seeded
 * random templates, well-formed and junk-laden alike, with Shopify/liquid and
 * with this engine in each error mode, and reports where they disagree.
 *
 *   npm run test:diff -- --seed 1 --count 2000
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Liquid, LiquidError } from '@chr33s/liquid'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const specDir = join(root, 'test/liquid-spec')
const MODES = ['lax', 'strict', 'strict2'] as const

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    count: { type: 'string', default: '1000' },
    report: { type: 'string', default: join(root, '.local/liquid-diff/report.json') },
    show: { type: 'string', default: '20' }
  }
})

const ENVIRONMENT = {
  a: 1,
  b: 'two',
  c: [1, 2, 3],
  h: { k: 'v', n: 2 },
  s: 'Hello World',
  f: 1.5,
  t: true,
  z: null,
  e: [],
  words: ['b', 'a', 'c'],
  objs: [{ x: 1 }, { x: 2 }, { x: null }]
}
const PARTIALS = { p: '[{{ a }}{{ p }}]', q: '{{ x | default: "q" }}' }

/** Mulberry32: a small seeded generator, so a seed always yields the same cases. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generator(next: () => number) {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  const chance = (p: number) => next() < p
  const literal = () =>
    pick(['1', '-2', '3.5', '0', '"s"', "'q'", '"1.5"', 'true', 'false', 'nil', 'empty', 'blank', "''"])
  const variable = () =>
    pick([
      'a',
      'b',
      'c',
      'h',
      's',
      'f',
      't',
      'z',
      'e',
      'words',
      'objs',
      'missing',
      'c[0]',
      'c[-1]',
      'c.first',
      'c.last',
      'c.size',
      'h.k',
      'h["n"]',
      'h.size',
      's.size',
      'objs[1].x',
      'words.first',
      'h[b]',
      'c[a]',
      'forloop.index',
      'i'
    ])
  const range = () => `(${pick(['1', 'a', '-1', '3'])}..${pick(['3', 'c.size', '0', 'a'])})`
  const value = (): string => (chance(0.45) ? variable() : chance(0.85) ? literal() : range())
  const filter = () =>
    pick([
      'upcase',
      'downcase',
      'size',
      'first',
      'last',
      'reverse',
      'sort',
      'uniq',
      'compact',
      'strip',
      'escape',
      'abs',
      'ceil',
      'floor',
      'capitalize',
      'join',
      'sum',
      `plus: ${value()}`,
      `minus: ${value()}`,
      `times: ${value()}`,
      `divided_by: ${value()}`,
      `modulo: ${value()}`,
      `append: ${value()}`,
      `prepend: ${value()}`,
      `split: ${pick(['" "', '","', '""'])}`,
      `join: ${pick(['"-"', '", "'])}`,
      `default: ${value()}`,
      `round: ${pick(['0', '1', '2'])}`,
      `slice: ${pick(['0', '1', '-1'])}${chance(0.5) ? ', 2' : ''}`,
      `truncate: ${pick(['3', '5'])}`,
      `replace: "l", "L"`,
      `remove: "o"`,
      `map: "x"`,
      `where: "x", 1`,
      `at_least: ${value()}`,
      `at_most: ${value()}`,
      `concat: c`,
      `date: "%Y"`
    ])
  const expression = () => {
    let text = value()
    const n = Math.floor(next() * 3)
    for (let i = 0; i < n; i++) text += ` | ${filter()}`
    return text
  }
  const comparison = () => pick(['==', '!=', '<>', '<', '>', '<=', '>=', 'contains'])
  const condition = (): string => {
    let text = chance(0.6) ? `${value()} ${comparison()} ${value()}` : value()
    if (chance(0.3)) text += ` ${pick(['and', 'or'])} ${condition()}`
    return text
  }
  /** Markup the reference's lax parser tolerates in some places and not others. */
  const junk = () => pick(['!', '=>', ',', '|', '||', '(', ')', ']', '[', 'foo', '?', '..', '-', ':', '"', 'and', ' '])
  const noisy = (markup: string) => {
    if (!chance(0.25)) return markup
    const parts = markup.split(' ')
    parts.splice(Math.floor(next() * (parts.length + 1)), 0, junk())
    return parts.join(' ')
  }
  const text = () => pick(['x', ' ', '\n', 'Hi ', '', '  \n  '])
  const block = (depth: number): string => {
    const items: string[] = []
    const n = 1 + Math.floor(next() * 3)
    for (let i = 0; i < n; i++) items.push(node(depth))
    return items.join('')
  }
  const dash = (open: boolean) => (chance(0.2) ? (open ? '{%-' : '-%}') : open ? '{%' : '%}')
  const tag = (markup: string) => `${dash(true)} ${noisy(markup)} ${dash(false)}`
  const node = (depth: number): string => {
    if (depth > 2) return chance(0.5) ? `{{ ${noisy(expression())} }}` : text()
    switch (Math.floor(next() * 14)) {
      case 0:
      case 1:
        return `{{ ${noisy(expression())} }}`
      case 2:
        return text()
      case 3:
        return `${tag(`if ${condition()}`)}${block(depth + 1)}${chance(0.4) ? `${tag(`elsif ${condition()}`)}${block(depth + 1)}` : ''}${chance(0.4) ? `${tag('else')}${block(depth + 1)}` : ''}${tag('endif')}`
      case 4:
        return `${tag(`unless ${condition()}`)}${block(depth + 1)}${tag('endunless')}`
      case 5:
        return `${tag(`for i in ${pick(['c', 'words', 'objs', 'e', 'h', 's', range()])}${chance(0.3) ? ' reversed' : ''}${chance(0.3) ? ` limit: ${pick(['1', '2', 'a'])}` : ''}${chance(0.3) ? ` offset: ${pick(['1', 'continue'])}` : ''}`)}${block(depth + 1)}${chance(0.2) ? `${tag('else')}x` : ''}${tag('endfor')}`
      case 6:
        return tag(`assign ${pick(['a', 'x', 'y'])} = ${expression()}`)
      case 7:
        return `${tag(`capture ${pick(['x', 'y'])}`)}${block(depth + 1)}${tag('endcapture')}{{ ${pick(['x', 'y'])} }}`
      case 8:
        return `${tag(`case ${value()}`)}${tag(`when ${value()}${chance(0.4) ? `, ${value()}` : ''}${chance(0.3) ? ` or ${value()}` : ''}`)}${block(depth + 1)}${chance(0.4) ? `${tag('else')}${block(depth + 1)}` : ''}${tag('endcase')}`
      case 9:
        return tag(`cycle ${chance(0.3) ? '"g": ' : ''}${value()}, ${value()}`)
      case 10:
        return tag(`${pick(['increment', 'decrement'])} ${pick(['n', 'm'])}`)
      case 11:
        return tag(`echo ${expression()}`)
      case 12:
        return tag(
          `${pick(['include', 'render'])} ${pick(["'p'", "'q'", 'b'])}${chance(0.4) ? ` ${pick(['with', 'for'])} ${value()}` : ''}${chance(0.3) ? `, x: ${value()}` : ''}`
        )
      default:
        return `${tag(pick(['comment', 'raw']))}{{ a }}${tag(pick(['endcomment', 'endraw']))}`
    }
  }
  return () => block(0)
}

/** How the reference prints an error in a render: `Liquid error (line N): message`. */
function describe(err: unknown): string {
  if (!LiquidError.is(err)) return String(err)
  let cause: Error = err
  while (LiquidError.is(cause) && cause.originalError) cause = cause.originalError
  const message = LiquidError.is(cause) ? cause.summary : cause.message
  return `(line ${err.token.getPosition()[0]}): ${message}`
}

type Result = { output?: string; parse_error?: string; render_error?: string; timeout?: boolean }

/** A file system that reports a missing partial as the reference's does. */
const fs = {
  sep: '/',
  exists: async () => true,
  readFile: async (file: string) => read(file),
  resolve: (_dir: string, file: string) => file
}
function read(file: string) {
  const content = PARTIALS[file as keyof typeof PARTIALS]
  if (content === undefined) throw Object.assign(new Error(`Could not find asset ${file}`), { code: 'ENOENT' })
  return content
}

async function ours(template: string, errorMode: (typeof MODES)[number]): Promise<Result> {
  const engine = new Liquid({ errorMode, fs, relativeReference: false })
  let parsed
  try {
    parsed = engine.parse(template)
  } catch (e) {
    return { parse_error: describe(e) }
  }
  try {
    return { output: await engine.render(parsed, structuredClone(ENVIRONMENT), { renderErrors: 'inline' }) }
  } catch (e) {
    return { render_error: describe(e) }
  }
}

/** A reference result as the reference prints a syntax error: `Liquid syntax error (line N): message`. */
function normalize(result: Result): string {
  // Ruby 3.4 prints a hash as `{"x" => 1}`; the reference's specs, and this engine, as `{"x"=>1}`
  if (result.output !== undefined) return `output ${JSON.stringify(result.output.replace(/" => /g, '"=>'))}`
  if (result.parse_error !== undefined) return `parse_error ${result.parse_error.replace(/^Liquid syntax error /, '')}`
  if (result.timeout) return 'timeout'
  return `render_error ${result.render_error}`
}

const env = {
  ...process.env,
  BUNDLE_GEMFILE: join(specDir, 'Gemfile'),
  BUNDLE_PATH: process.env.BUNDLE_PATH ?? join(root, '.local/liquid-spec/bundle')
}
if (spawnSync('bundle', ['check'], { cwd: specDir, env }).status !== 0) {
  const install = spawnSync('bundle', ['install', '--quiet'], { cwd: specDir, env, stdio: 'inherit' })
  if (install.status !== 0) process.exit(install.status ?? 1)
}
const reference = spawn('bundle', ['exec', 'ruby', join(specDir, 'differential.rb')], {
  cwd: specDir,
  env,
  stdio: ['pipe', 'pipe', 'inherit']
})
const replies = createInterface({ input: reference.stdout! })[Symbol.asyncIterator]()
async function theirs(template: string, mode: string): Promise<Result> {
  reference.stdin!.write(JSON.stringify({ template, mode, environment: ENVIRONMENT, partials: PARTIALS }) + '\n')
  const { value, done } = await replies.next()
  if (done) throw new Error('the reference process exited')
  return JSON.parse(value)
}

/**
 * Differences this engine keeps on purpose, each with its reason. The corpus
 * fixture `assign_swallows_filter_error` has a filter error inside `assign`
 * render nothing, which the pinned reference does in lax and strict but not
 * in strict2.
 */
function accepted(mode: string, template: string, reference: string, engine: string): string | undefined {
  const errors = (text: string) => text.split('Liquid error').length
  const quietAssign =
    mode === 'strict2' &&
    template.includes('assign') &&
    reference.startsWith('output') &&
    engine.startsWith('output') &&
    errors(reference) > errors(engine)
  if (quietAssign) return 'assign_swallows_filter_error'
  // `strip`, `lstrip` and `rstrip` take an optional set of characters to strip, where the reference takes none
  const stripChars = /strip/.test(template) && reference.includes('wrong number of arguments (given 2, expected 1)')
  if (stripChars) return 'strip_characters_extension'
}

const seed = Number(values.seed)
const count = Number(values.count)
const generate = generator(random(seed))
type Mismatch = { case: number; mode: string; template: string; reference: string; engine: string }
const mismatches: Mismatch[] = []
const divergences: (Mismatch & { reason: string })[] = []
for (let i = 0; i < count; i++) {
  const template = generate()
  for (const mode of MODES) {
    const expected = normalize(await theirs(template, mode))
    const actual = normalize(await ours(template, mode))
    if (expected === actual) continue
    const mismatch = { case: i, mode, template, reference: expected, engine: actual }
    const reason = accepted(mode, template, expected, actual)
    if (reason) divergences.push({ ...mismatch, reason })
    else mismatches.push(mismatch)
  }
}
reference.stdin!.end()

const byMode = Object.fromEntries(MODES.map(mode => [mode, mismatches.filter(m => m.mode === mode).length]))
mkdirSync(dirname(values.report!), { recursive: true })
writeFileSync(values.report!, JSON.stringify({ seed, count, byMode, mismatches, divergences }, null, 2) + '\n')
console.log(
  `liquid-diff seed ${seed}: ${count} templates x ${MODES.length} modes, ${mismatches.length} mismatches ` +
    `(${divergences.length} accepted divergences)`,
  byMode
)
for (const m of mismatches.slice(0, Number(values.show))) {
  console.log(
    `\n#${m.case} [${m.mode}] ${JSON.stringify(m.template)}\n  reference: ${m.reference}\n  engine:    ${m.engine}`
  )
}
console.log(`report: ${values.report}`)
process.exit(mismatches.length ? 1 : 0)
