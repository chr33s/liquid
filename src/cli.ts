import fs from 'fs/promises'
import { program } from 'commander'
import { Liquid } from './index'

render().catch(err => {
  process.stderr.write(`${err.message}\n`)
  process.exitCode = 1
})

async function render() {
  program
    .name('liquidjs')
    .description('Render a Liquid template')
    .argument('<template>', 'liquid template to render (inline, @path, or @- for stdin)')
    .option('-c, --context <json | @path>', 'input context in JSON format (inline, @path, or @- for stdin)')
    .option('-o, --output <path>', 'write rendered output to file (omit to write to stdout)')
    .option('--cache [size]', 'cache previously parsed template structures (default cache size: 1024)')
    .option('--extname <string>', 'use a default filename extension when resolving partials and layouts')
    .option('--jekyll-include', 'use jekyll-style include (pass parameters to include variable of current scope)')
    .option('--js-truthy', 'use JavaScript-style truthiness')
    .option('--layouts <path...>', 'directories from where to resolve layouts (defaults to --root)')
    .option(
      '--lenient-if',
      'do not throw on undefined variables in conditional expressions (when using --strict-variables)'
    )
    .option('--no-dynamic-partials', 'always treat file paths for partials and layouts as a literal value')
    .option('--no-greedy', 'disable greedy matching for --trim* options')
    .option('--no-relative-reference', 'require absolute file paths for partials and layouts')
    .option('--ordered-filter-parameters', 'respect parameter order when using filters')
    .option('--output-delimiter-left <string>', 'left delimiter to use for liquid outputs')
    .option('--output-delimiter-right <string>', 'right delimiter to use for liquid outputs')
    .option('--partials <path...>', 'directories from where to resolve partials (defaults to --root)')
    .option('--preserve-timezones', 'preserve input timezone in date filter')
    .option('--root <path...>', 'directories from where to resolve partials and layouts (defaults to ".")')
    .option('--strict-filters', 'throw on undefined filters instead of skipping them')
    .option('--strict-variables', 'throw on undefined variables instead of rendering them as empty string')
    .option('--tag-delimiter-left <string>', 'left delimiter to use for liquid tags')
    .option('--tag-delimiter-right <string>', 'right delimiter to use for liquid tags')
    .option(
      '--timezone-offset <value>',
      'JavaScript timezone name or timezoneOffset value to use in date filter (defaults to local timezone)'
    )
    .option('--trim-output-left', 'trim whitespace from left of liquid outputs')
    .option('--trim-output-right', 'trim whitespace from right of liquid outputs')
    .option('--trim-tag-left', 'trim whitespace from left of liquid tags')
    .option('--trim-tag-right', 'trim whitespace from right of liquid tags')
    .showHelpAfterError('Use -h or --help for additional information.')
    .parse()

  const options = program.opts()
  const templateOption = program.args[0]

  if (
    Object.values({ template: templateOption, context: options.context }).filter(value => value === '@-').length > 1
  ) {
    throw new Error(`The stdin input specifier '@-' must only be used once.`)
  }

  const template = await resolveInputOption(templateOption)
  const context = await resolveContext(options.context)
  const liquid = new Liquid(options)
  const output = await liquid.parseAndRender(template, context)
  if (options.output) {
    await fs.writeFile(options.output, output)
  } else {
    process.stdout.write(output)
  }
}

async function resolveContext(contextOption?: string) {
  let contextJson = '{}'
  if (contextOption) {
    contextJson = await resolveInputOption(contextOption)
  }
  const context = JSON.parse(contextJson)
  return context
}

async function resolveInputOption(option: string): Promise<string> {
  if (option === '@-') {
    return readStream(process.stdin)
  }
  if (option.startsWith('@')) {
    const filePath = option.slice(1)
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile()) {
      throw new Error(`'${filePath}' does not exist or is not a file`)
    }
    return fs.readFile(filePath, 'utf8')
  }
  return option
}

async function readStream(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}
