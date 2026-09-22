#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const specDir = join(root, 'test/liquid-spec')
const adapter = join(specDir, 'adapter.rb')
const knownFailuresFile = join(specDir, 'known-failures.txt')
/**
 * `all` is every default suite; `parser_errors` is the strict2 syntax suite,
 * which is not a default one. The runner runs a fixture declared for both
 * strict2 and strict only as strict2, so a second profile without strict2
 * exercises the strict contract. The `shopify_theme` profile runs the hosted
 * dialect, whose fixtures were recorded from Shopify production.
 */
type Selection = { name: string; suite: string; modes?: string; profile?: string }
const SELECTIONS: Selection[] = [
  { name: 'all', suite: 'all' },
  { name: 'parser_errors', suite: 'parser_errors' },
  { name: 'all (strict profile)', suite: 'all', modes: 'strict,lax' },
  { name: 'all (shopify_theme profile)', suite: 'all', profile: 'shopify_theme' }
]

const { values } = parseArgs({
  options: {
    report: { type: 'string', default: join(root, '.local/liquid-spec/report.json') },
    'update-known-failures': { type: 'boolean', default: false }
  }
})
const updating = values['update-known-failures']

const env = {
  ...process.env,
  BUNDLE_GEMFILE: join(specDir, 'Gemfile'),
  BUNDLE_PATH: process.env.BUNDLE_PATH ?? join(root, '.local/liquid-spec/bundle')
}

if (spawnSync('bundle', ['check'], { cwd: specDir, env }).status !== 0) {
  const install = spawnSync('bundle', ['install', '--quiet'], { cwd: specDir, env, stdio: 'inherit' })
  if (install.status !== 0) process.exit(install.status ?? 1)
}

function liquidSpec({ modes, profile }: Selection, ...args: string[]) {
  const result = spawnSync('bundle', ['exec', 'liquid-spec', 'run', adapter, ...args], {
    cwd: specDir,
    env: {
      ...env,
      ...(modes && { LIQUID_SPEC_ERROR_MODES: modes }),
      ...(profile && { LIQUID_SPEC_PROFILE: profile })
    },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  if (result.error) throw result.error
  return result
}

function command(cmd: string, ...args: string[]) {
  return spawnSync(cmd, args, { env, encoding: 'utf8' }).stdout.trim()
}

function lockedRevision(gem: string) {
  const lock = readFileSync(join(specDir, 'Gemfile.lock'), 'utf8')
  const block = lock.split('\n\n').find(section => section.includes(`\n  specs:\n    ${gem} (`))
  return block?.match(/revision: (\w+)/)?.[1]
}

function run(selection: Selection) {
  const { name, suite } = selection
  const args = ['--suite', suite, ...(updating ? [] : [`--known-failures=${knownFailuresFile}`])]
  const json = liquidSpec(selection, '--json', ...args)
  let result
  try {
    result = JSON.parse(json.stdout)
  } catch {
    throw new Error(`liquid-spec --suite ${suite} did not report JSON:\n${json.stdout}\n${json.stderr}`)
  }
  const summary = liquidSpec(selection, ...args).stdout.match(/, (\d+) skipped/)
  for (const entry of [...result.failures, ...result.known_failures, ...result.known_fixed]) {
    entry.source_file = String(entry.source_file).replace(/^.*?\/(?=specs\/)/, '')
  }
  const { totals } = result
  const selected = totals.passed + totals.failed + totals.errors + totals.known_failures
  return {
    suite: name,
    result,
    totals: {
      selected,
      passed: totals.passed,
      failed: selected - totals.passed,
      skipped: Number(summary?.[1] ?? 0),
      knownFailures: result.known_failures.length,
      knownNowPassing: result.known_fixed.length,
      unexpectedFailures: result.failures.length
    },
    complexity: { cleared: result.max_complexity_reached, max: result.max_possible_complexity }
  }
}

const runs = SELECTIONS.map(run)
const failures: any[] = runs.flatMap(({ result }) => [...result.failures, ...result.known_failures])
const unexpected: any[] = runs.flatMap(({ result }) => result.failures)
const knownNowPassing: any[] = runs.flatMap(({ result }) => result.known_fixed)
const protocolErrors = failures.filter(f => /ProtocolError|SubprocessError|Internal error/.test(String(f.actual)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const report = {
  sources: {
    'Shopify/liquid-spec': lockedRevision('liquid-spec'),
    'Shopify/liquid': lockedRevision('liquid'),
    pinned: pkg.ref
  },
  runtime: { node: process.version, ruby: command('ruby', '-e', 'print RUBY_VERSION'), engine: pkg.version },
  adapter: {
    file: 'test/liquid-spec/adapter.rb',
    server: 'bin/liquid-spec-server.mts',
    missingFeatures: runs[0].result.missing_features,
    skippedSuites: runs[0].result.skipped_suites
  },
  suites: Object.fromEntries(runs.map(({ suite, totals, complexity }) => [suite, { ...totals, complexity }])),
  protocolErrors: protocolErrors.length,
  failures,
  knownNowPassing
}

mkdirSync(dirname(values.report!), { recursive: true })
writeFileSync(values.report!, JSON.stringify(report, null, 2) + '\n')

if (updating) {
  const names = [...new Set(failures.map(f => String(f.name)))].sort((a, b) => a.localeCompare(b))
  writeFileSync(
    knownFailuresFile,
    [
      '# Fixtures of the pinned Shopify/liquid-spec corpus this engine does not pass in a profile.',
      '# A fixture named for the strict contract fails when the runner runs it as strict2, and one named',
      '# for strict2 when it runs as strict; each passes in the profile it is named for.',
      '# In the shopify_theme profile: the shopify_theme_dawn fixtures render Dawn snippets, locale',
      '# translations and theme settings the corpus does not ship; a nil and an empty filesystem, and',
      '# the keys `x` and `x.liquid`, reach the server alike over JSON-RPC; the unconventional-names and',
      '# jwt recordings depend on Shopify file system and string semantics Ruby Liquid does not share;',
      '# and the subcontext recording needs a Ruby context class.',
      '# Regenerate with `npm run test:spec -- --update-known-failures`; never add a name to hide a regression.',
      ...names
    ].join('\n') + '\n'
  )
}

console.log(
  `liquid-spec ${report.sources['Shopify/liquid-spec']?.slice(0, 7)}, ${protocolErrors.length} protocol errors`
)
for (const { suite, totals, complexity } of runs) {
  console.log(
    `  ${suite}: ${totals.selected} selected, ${totals.passed} passed, ${totals.failed} failed ` +
      `(${totals.knownFailures} known, ${totals.unexpectedFailures} unexpected), ` +
      `${totals.knownNowPassing} known now passing, ${totals.skipped} skipped; complexity ${complexity.cleared} of ${complexity.max}`
  )
}
console.log(`report: ${values.report}`)
if (!updating) {
  for (const f of unexpected) console.log(`unexpected failure: ${f.name} (${f.source_file}:${f.line_number})`)
  for (const f of knownNowPassing) console.log(`known failure now passes: ${f.name}`)
}
for (const f of protocolErrors) console.log(`protocol error: ${f.name}: ${f.actual}`)

const failed = protocolErrors.length > 0 || (!updating && (unexpected.length > 0 || knownNowPassing.length > 0))
process.exit(failed ? 1 : 0)
