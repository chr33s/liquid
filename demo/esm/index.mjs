import { Liquid } from '@chr33s/liquid'

const engine = new Liquid({
  extname: '.liquid',
  globals: { title: 'LiquidJS Demo' },
  // root files for `.render()` and `.parse()`
  root: process.cwd(),
  // layout files for `{% layout %}`
  layouts: process.cwd() + '/layouts',
  // partial files for `{% include %}` and `{% render %}`
  partials: [process.cwd() + '/partials', 'node_modules']
})

const ctx = {
  todos: ['fork and clone', 'make it better', 'make a pull request']
}

async function main () {
  console.log('==========renderFile===========')
  const html = await engine.renderFile('todolist', ctx)
  console.log(html)

  console.log('===========Streamed===========')
  const tpls = await engine.parseFile('todolist')
  const reader = engine.renderToStream(tpls, ctx).pipeThrough(new TextEncoderStream()).getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      process.stdout.write(value)
    }
  } finally { reader.releaseLock() }
  console.log('')
}

main()
