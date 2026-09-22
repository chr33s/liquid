import { resolve } from 'path'
import { drainStream } from '../stub/stream'
describe('.renderToStream()', function () {
  it('should render to stream in Node.js', async () => {
    const cjs = require('../../dist/liquid.node.cjs')
    const engine = new cjs.Liquid({ root: resolve(__dirname, '../stub/root/') })
    const tpl = await engine.parseFile('foo.html')
    const stream = engine.renderToStream(tpl)
    await expect(drainStream(stream)).resolves.toBe('foo')
  })
  it('should stream in browser', async function () {
    const cjs = require('../../dist/liquid.browser.umd.js')
    const engine = new cjs.Liquid()
    await expect(drainStream(engine.renderToStream(engine.parse('foo')))).resolves.toBe('foo')
  })
})
describe('.renderFileToStream()', function () {
  it('should render to stream in Node.js', async () => {
    const cjs = require('../../dist/liquid.node.cjs')
    const engine = new cjs.Liquid({
      root: resolve(__dirname, '../stub/root/')
    })
    const stream = await engine.renderFileToStream('foo.html')
    await expect(drainStream(stream)).resolves.toBe('foo')
  })
})
