import { resolve } from 'path'
import { drainStream } from '../stub/stream'

describe('.renderToNodeStream()', function () {
  it('should render to stream in Node.js', async () => {
    const cjs = require('../../dist/liquid.node.cjs')
    const engine = new cjs.Liquid({ root: resolve(__dirname, '../stub/root/') })
    const tpl = engine.parseFileSync('foo.html')
    const stream = engine.renderToNodeStream(tpl)
    await expect(drainStream(stream)).resolves.toBe('foo')
  })
  it('should throw in browser', async function () {
    const cjs = require('../../dist/liquid.browser.umd.js')
    const engine = new cjs.Liquid()
    const render = () => engine.renderToNodeStream('foo')
    return expect(render).toThrow('streaming not supported in browser')
  })
})

describe('.renderFileToNodeStream()', function () {
  it('should render to stream in Node.js', async () => {
    const cjs = require('../../dist/liquid.node.cjs')
    const engine = new cjs.Liquid({
      root: resolve(__dirname, '../stub/root/')
    })
    const stream = await engine.renderFileToNodeStream('foo.html')
    await expect(drainStream(stream)).resolves.toBe('foo')
  })
})
