const { Liquid, LayoutTag, Tag, Value } = require('@chr33s/liquid')

const engine = new Liquid({
  extname: '.liquid',
  globals: { title: 'NodeJS Demo for LiquidJS' },
  // root files for `.render()` and `.parse()`
  root: __dirname,
  // layout files for `{% layout %}`
  layouts: './layouts',
  // partial files for `{% include %}` and `{% render %}`
  partials: './partials'
})
// `layout` belongs to the hosted dialect; a core engine registers it itself
engine.registerTag('layout', LayoutTag)

engine.registerTag('header', class HeaderTag extends Tag {
  constructor (token, remainTokens, liquid) {
    super(token, remainTokens, liquid)
    this.value = new Value(token.args, liquid)
  }
  * render (ctx, emitter) {
    const title = yield this.value.value(ctx)
    yield emitter.write(`<h1>${title}</h1>`)
  }
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
