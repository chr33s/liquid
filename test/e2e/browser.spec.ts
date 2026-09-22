const LiquidUMD = require('../../dist/liquid.browser.umd.js').Liquid
describe('browser', function () {
  it('should yield unclosed output error', () => {
    const engine = new LiquidUMD()
    return expect(engine.parseAndRender('{{huh')).rejects.toMatchObject({
      message: "Variable '{{huh' was not properly terminated with regexp: /\\}\\}/, line:1, col:1"
    })
  })
  it('should throw tokenization error for invalid filter syntax', async () => {
    const engine = new LiquidUMD({ errorMode: 'warn' })
    const message = 'expected filter name, line:1, col:10'
    const stack = ['>> 1| {{ foo | ^ }}', '               ^', `TokenizationError: ${message}`].join('\n')
    await expect(engine.parseAndRender('{{ foo | ^ }}')).rejects.toMatchObject({
      message,
      stack: expect.stringContaining(stack),
      name: 'TokenizationError'
    })
  })
})

describe('browser bundle', function () {
  it('should not pull in the node crypto module', () => {
    const fs = require('fs')
    const path = require('path')
    for (const bundle of ['liquid.browser.mjs', 'liquid.browser.umd.js']) {
      const source = fs.readFileSync(path.resolve(__dirname, '../../dist', bundle), 'utf8')
      expect(source).not.toMatch(/from ["']crypto["']|require\(["']crypto["']\)/)
    }
  })

  it('should hash with the browser implementations in the hosted profile', async () => {
    const engine = new LiquidUMD({ profile: 'shopify_theme', templates: {} })
    expect(await engine.parseAndRender('{{ "abc" | md5 }}')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(await engine.parseAndRender('{{ "abc" | blake3 }}')).toBe(
      '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85'
    )
    expect(await engine.parseAndRender('{{ "abc" | sha1 }}')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(await engine.parseAndRender('{{ "abc" | sha256 }}')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(await engine.parseAndRender('{{ "Hi There" | hmac_sha1: k }}', { k: '\x0b'.repeat(20) })).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00'
    )
  })
})
