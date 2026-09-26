import { Liquid, Context, isFalsy } from '../../../src'
import { mock, restore } from '../../stub/mockfs'
import { drainStream } from '../../stub/stream'
import { ThrowingTag } from '../../stub/tags'
import { resolve } from 'path'
describe('Liquid', function () {
  describe('#plugin()', function () {
    it('should call plugin on the instance', async function () {
      const engine = new Liquid()
      engine.plugin(function () {
        this.registerFilter('foo', x => `foo${x}foo`)
      })
      const html = await engine.parseAndRender('{{"bar"|foo}}')
      expect(html).toBe('foobarfoo')
    })
    it('should call plugin with Liquid', async function () {
      const engine = new Liquid()
      engine.plugin(function () {
        this.registerFilter('t', function (v) {
          return isFalsy(v, this.context)
        })
      })
      const html = await engine.parseAndRender('{{false|t}}')
      expect(html).toBe('true')
    })
  })
  describe('#parseAndRender', function () {
    const engine = new Liquid()
    it('should parse and render variable output', async function () {
      const html = await engine.parseAndRender('{{"foo"}}')
      expect(html).toBe('foo')
    })
    it('should parse and render complex output', async function () {
      const tpl = '{{ "Welcome|to]Liquid" | split: "|" | join: "("}}'
      const html = await engine.parseAndRender(tpl)
      expect(html).toBe('Welcome(to]Liquid')
    })
    it('should support for-in with variable', async function () {
      const src = '{% assign total = 3 | minus: 1 %}' + '{% for i in (1..total) %}{{ i }}{% endfor %}'
      const html = await engine.parseAndRender(src, {})
      return expect(html).toBe('12')
    })
    it('should support `globals` render option', async function () {
      const src = '{{ foo }}'
      const html = await engine.parseAndRender(src, {}, { globals: { foo: 'FOO' } })
      return expect(html).toBe('FOO')
    })
    it('should support `strictVariables` render option', function () {
      const src = '{{ foo }}'
      return expect(engine.parseAndRender(src, {}, { strictVariables: true })).rejects.toThrow(/undefined variable/)
    })
    it('should support async variables in output', async () => {
      const src = '{{ foo }}'
      const html = await engine.parseAndRender(src, { foo: Promise.resolve('FOO') })
      expect(html).toBe('FOO')
    })
    it('should parse and render with Context', async function () {
      const html = await engine.parseAndRender('{{foo}}', new Context({ foo: 'FOO' }))
      expect(html).toBe('FOO')
    })
  })
  describe('#parseAndRender', function () {
    const engine = new Liquid()
    it('should parse and render variable output', async function () {
      const html = await engine.parseAndRender('{{"foo"}}')
      expect(html).toBe('foo')
    })
    it('should parse and render complex output', async function () {
      const tpl = '{{ "Welcome|to]Liquid" | split: "|" | join: "("}}'
      const html = await engine.parseAndRender(tpl)
      expect(html).toBe('Welcome(to]Liquid')
    })
    it('should support for-in with variable', async function () {
      const src = '{% assign total = 3 | minus: 1 %}' + '{% for i in (1..total) %}{{ i }}{% endfor %}'
      const html = await engine.parseAndRender(src, {})
      return expect(html).toBe('12')
    })
    it('should support `globals` render option', async function () {
      const src = '{{ foo }}'
      const html = await engine.parseAndRender(src, {}, { globals: { foo: 'FOO' } })
      return expect(html).toBe('FOO')
    })
    it('should support `strictVariables` render option', async function () {
      const src = '{{ foo }}'
      return await expect(async () => await engine.parseAndRender(src, {}, { strictVariables: true })).rejects.toThrow(
        /undefined variable/
      )
    })
  })
  describe('#express()', function () {
    const liquid = new Liquid({ root: '/root' })
    const render = liquid.express()
    beforeEach(function () {
      mock({
        '/root/foo': 'foo'
      })
    })
    afterEach(restore)
    it('should render single template', async function () {
      const result = await new Promise((resolve, reject) => {
        render.call({ root: '/root' }, 'foo', null as any, (err: Error | null, html: string | undefined) => {
          err ? reject(err) : resolve(html)
        })
      })
      expect(result).toBe('foo')
    })
    it('should render single template with Array-typed root', async function () {
      const result = await new Promise((resolve, reject) => {
        render.call({ root: ['/root'] }, 'foo', null as any, (err: Error | null, html: string | undefined) => {
          err ? reject(err) : resolve(html)
        })
      })
      expect(result).toBe('foo')
    })
    it('should prepend the view root once per engine', function () {
      const engine = new Liquid({ root: '/root' })
      const callback = () => {}
      engine.express().call({ root: '/views' }, 'foo', {}, callback)
      engine.express().call({ root: '/views' }, 'foo', {}, callback)
      expect(engine.options.root).toEqual(['/views', '/root'])
    })
  })
  describe('#renderFile', function () {
    afterEach(restore)
    it('should throw with lookup list when file not exist', function () {
      const engine = new Liquid({
        root: ['/boo', '/root/'],
        extname: '.html'
      })
      return expect(engine.renderFile('/not/exist.html')).rejects.toThrow(
        /Failed to lookup "\/not\/exist.html" in "\/boo,\/root\/"/
      )
    })
    it('should reject absolute paths outside root', async function () {
      mock({
        '/safe/foo.html': 'safe',
        '/etc/secret': 'SECRET'
      })
      const engine = new Liquid({ root: ['/safe'] })
      await expect(engine.renderFile('/etc/secret')).rejects.toThrow(/Failed to lookup/)
    })
    it('should reject absolute paths outside root (Promise)', async function () {
      mock({
        '/safe/foo.html': 'safe',
        '/etc/secret': 'SECRET'
      })
      const engine = new Liquid({ root: ['/safe'] })
      await expect(async () => await engine.renderFile('/etc/secret')).rejects.toThrow(/Failed to lookup/)
    })
  })
  describe('#parseFile', function () {
    it('should throw with lookup list when file not exist', function () {
      const engine = new Liquid({
        root: ['/boo', '/root/'],
        extname: '.html'
      })
      return expect(engine.parseFile('/not/exist.html')).rejects.toThrow(
        /Failed to lookup "\/not\/exist.html" in "\/boo,\/root\/"/
      )
    })
    it('should fallback to require.resolve in Node.js', async function () {
      const engine = new Liquid({
        root: [resolve(__dirname, '../../..')],
        extname: '.html'
      })
      const tpls = await engine.parseFile('express')
      expect(tpls.length).toBeGreaterThanOrEqual(1)
      expect(tpls[0].token.getText()).toContain('use strict')
    })
  })
  describe('#evalValue', function () {
    it('should eval string literal', async function () {
      const engine = new Liquid()
      const ctx = new Context()
      const str = await engine.evalValue('"foo"', ctx)
      expect(str).toBe('foo')
    })
    it('should support plain scope', async function () {
      const engine = new Liquid()
      const str = await engine.evalValue('foo', { foo: 'FOO' })
      expect(str).toBe('FOO')
    })
  })
  describe('#evalValue', function () {
    it('should eval string literal', async function () {
      const engine = new Liquid()
      const ctx = new Context()
      const str = await engine.evalValue('"foo"', ctx)
      expect(str).toBe('foo')
    })
  })
  describe('#parse', function () {
    it('should resolve relative partials', async function () {
      const engine = new Liquid({
        root: ['/'],
        extname: '.html'
      })
      mock({
        '/root/partial.html': 'foo'
      })
      const tpls = engine.parse('{% render "./partial.html" %}', '/root/index.html')
      return expect(await engine.render(tpls)).toBe('foo')
    })
    it('should resolve against pwd for relative filepath', async function () {
      const engine = new Liquid({
        root: ['/'],
        extname: '.html'
      })
      mock({
        [`${process.cwd()}/partial.html`]: 'foo'
      })
      const tpls = engine.parse('{% render "./partial.html" %}', './index.html')
      return expect(await engine.render(tpls)).toBe('foo')
    })
  })
  describe('#parseFile', function () {
    it('should throw with lookup list when file not exist', async function () {
      const engine = new Liquid({
        root: ['/boo', '/root/'],
        extname: '.html'
      })
      return await expect(async () => await engine.parseFile('/not/exist.html')).rejects.toThrow(
        /Failed to lookup "\/not\/exist.html" in "\/boo,\/root\/"/
      )
    })
    it('should throw with lookup list when file not exist', async function () {
      const engine = new Liquid({
        root: ['/boo', '/root/'],
        extname: '.html'
      })
      return await expect(async () => await engine.parseFile('/not/exist.html')).rejects.toThrow(
        /Failed to lookup "\/not\/exist.html" in "\/boo,\/root\/"/
      )
    })
  })
  describe('#enderToStream', function () {
    const engine = new Liquid()
    it('should render a simple value', async () => {
      const stream = engine.renderToStream(engine.parse('{{"foo"}}'))
      await expect(drainStream(stream)).resolves.toBe('foo')
    })
  })
  describe('#enderFileToStream', function () {
    let engine: Liquid
    beforeEach(function () {
      mock({
        '/root/foo.html': 'foo',
        '/root/error.html': 'A{%throwingTag%}B'
      })
      engine = new Liquid({ root: ['/root/'] })
      engine.registerTag('throwingTag', ThrowingTag)
    })
    afterEach(restore)
    it('should render a simple value', async () => {
      const stream = await engine.renderFileToStream('foo.html')
      await expect(drainStream(stream)).resolves.toBe('foo')
    })
    it('should throw RenderError when tag throws', async () => {
      const stream = await engine.renderFileToStream('error.html')
      await expect(drainStream(stream)).rejects.toThrow(/intended error/)
    })
  })
  describe('#analyze', () => {
    const engine = new Liquid()
    it('should analyze templates asynchronously', async () => {
      const template = engine.parse('{{ a }}{{ b }}')
      await expect(engine.analyze(template).then(a => Object.keys(a.variables))).resolves.toStrictEqual(['a', 'b'])
    })
  })
  describe('#analyze', () => {
    const engine = new Liquid()
    it('should analyze templates synchronously', async () => {
      const template = engine.parse('{{ a }}{{ b }}')
      expect(Object.keys((await engine.analyze(template)).variables)).toStrictEqual(['a', 'b'])
    })
  })
  describe('#parseAndAnalyze', () => {
    const engine = new Liquid()
    it('should parse and analyze templates asynchronously', async () => {
      await expect(engine.parseAndAnalyze('{{ a }}{{ b }}').then(a => Object.keys(a.variables))).resolves.toStrictEqual(
        ['a', 'b']
      )
    })
  })
  describe('#parseAndAnalyze', () => {
    const engine = new Liquid()
    it('should analyze templates synchronously', async () => {
      expect(Object.keys((await engine.parseAndAnalyze('{{ a }}{{ b }}')).variables)).toStrictEqual(['a', 'b'])
    })
  })
  describe('Convenience analysis', () => {
    const engine = new Liquid()
    it('should list all variables without their properties', async () => {
      await expect(engine.variables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual(['a', 'c'])
      await expect(engine.variables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).resolves.toStrictEqual([
        'a',
        'c'
      ])
    })
    it('should list all variables without their properties synchronously', async () => {
      expect(await engine.variables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual(['a', 'c'])
      expect(await engine.variables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).toStrictEqual([
        'a',
        'c'
      ])
    })
    it('should list global variables without their properties', async () => {
      await expect(engine.globalVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual(['a'])
      await expect(
        engine.globalVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).resolves.toStrictEqual(['a'])
    })
    it('should list global variables without their properties synchronously', async () => {
      expect(await engine.globalVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual(['a'])
      expect(await engine.globalVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).toStrictEqual([
        'a'
      ])
    })
    it('should list all variables with their properties', async () => {
      await expect(engine.fullVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual([
        'a.b',
        'c'
      ])
      await expect(
        engine.fullVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).resolves.toStrictEqual(['a.b', 'c'])
    })
    it('should list all variables with their properties synchronously', async () => {
      expect(await engine.fullVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual(['a.b', 'c'])
      expect(await engine.fullVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).toStrictEqual([
        'a.b',
        'c'
      ])
    })
    it('should list global variables with their properties', async () => {
      await expect(engine.globalFullVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual([
        'a.b'
      ])
      await expect(
        engine.globalFullVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).resolves.toStrictEqual(['a.b'])
    })
    it('should list global variables with their properties synchronously', async () => {
      expect(await engine.globalFullVariables('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual(['a.b'])
      expect(await engine.globalFullVariables(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).toStrictEqual(
        ['a.b']
      )
    })
    it('should list all variables as an array of segments', async () => {
      await expect(engine.variableSegments('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual([
        ['a', 'b'],
        ['c']
      ])
      await expect(
        engine.variableSegments(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).resolves.toStrictEqual([['a', 'b'], ['c']])
    })
    it('should list all variables as an array of segments synchronously', async () => {
      expect(await engine.variableSegments('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual([
        ['a', 'b'],
        ['c']
      ])
      expect(await engine.variableSegments(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))).toStrictEqual([
        ['a', 'b'],
        ['c']
      ])
    })
    it('should list all variables as an array of segments with nested variables as arrays', async () => {
      await expect(engine.variableSegments('{{ a[b.c].d }}')).resolves.toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
      await expect(engine.variableSegments(engine.parse('{{ a[b.c].d }}'))).resolves.toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
    })
    it('should list all variables synchronously as an array of segments with nested variables as arrays', async () => {
      expect(await engine.variableSegments('{{ a[b.c].d }}')).toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
      expect(await engine.variableSegments(engine.parse('{{ a[b.c].d }}'))).toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
    })
    it('should list global variables as an array of segments', async () => {
      await expect(engine.globalVariableSegments('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).resolves.toStrictEqual([
        ['a', 'b']
      ])
      await expect(
        engine.globalVariableSegments(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).resolves.toStrictEqual([['a', 'b']])
    })
    it('should list global variables as an array of segments synchronously', async () => {
      expect(await engine.globalVariableSegments('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}')).toStrictEqual([
        ['a', 'b']
      ])
      expect(
        await engine.globalVariableSegments(engine.parse('{% assign c = 1 %}{{ a.b }}{{ c }}{{ c }}'))
      ).toStrictEqual([['a', 'b']])
    })
    it('should list global variables as an array of segments with nested variables as arrays', async () => {
      await expect(engine.globalVariableSegments('{{ a[b.c].d }}')).resolves.toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
      await expect(engine.globalVariableSegments(engine.parse('{{ a[b.c].d }}'))).resolves.toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
    })
    it('should list global variables synchronously as an array of segments with nested variables as arrays', async () => {
      expect(await engine.globalVariableSegments('{{ a[b.c].d }}')).toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
      expect(await engine.globalVariableSegments(engine.parse('{{ a[b.c].d }}'))).toStrictEqual([
        ['a', ['b', 'c'], 'd'],
        ['b', 'c']
      ])
    })
  })
})
