import { Liquid } from '../../../src/liquid'
import type { ThemeProviders } from '../../../src/theme'

describe('parity: reclassified filters and hosted pure extensions', function () {
  const core = new Liquid()
  const hosted = (theme: ThemeProviders = {}) => new Liquid({ profile: 'shopify_theme', theme })

  it('H01: json, sha256 and hmac_sha256 are hosted-only', function () {
    for (const name of ['json', 'sha256', 'hmac_sha256']) {
      expect(core.filters[name]).toBeUndefined()
      expect(hosted().filters[name]).toBeDefined()
    }
  })

  it('H01: hosted-only names are absent from the core registry', function () {
    for (const name of ['md5', 'sha1', 'blake3', 'hmac_sha1', 'handleize', 'money', 'color_to_hex', 't']) {
      expect(core.filters[name]).toBeUndefined()
      expect(hosted().filters[name]).toBeDefined()
    }
  })

  it('H02: hosted JSON serializes portable values without leaking internals', async function () {
    const engine = hosted()
    expect(await engine.parseAndRender('{{ nil | json }}')).toBe('null')
    expect(await engine.parseAndRender(`{{ 'a"b' | json }}`)).toBe('"a\\"b"')
    expect(await engine.parseAndRender('{{ v | json }}', { v: ['a', 1, null] })).toBe('["a",1,null]')
    expect(await engine.parseAndRender('{{ v | json }}', { v: { b: 2, a: 1 } })).toBe('{"b":2,"a":1}')
    expect(await engine.parseAndRender('{{ v | json }}', { v: 'é' })).toBe('"é"')
    expect(await engine.parseAndRender('{{ v | json }}', { v: { fn: () => 1, a: 1 } })).toBe('{"a":1}')
  })

  it('hosted JSON preserves large integer digits in scalars and nested values', async function () {
    const engine = hosted()
    engine.registerFilter('record', id => ({ id, values: [id, { negative: -id }] }))
    expect(await engine.parseAndRender('{{ 9007199254740993 | json }}')).toBe('9007199254740993')
    expect(await engine.parseAndRender('{% assign n = 9007199254740993 | plus: 2 %}{{ n | record | json }}')).toBe(
      '{"id":9007199254740995,"values":[9007199254740995,{"negative":-9007199254740995}]}'
    )
    expect(await engine.parseAndRender('{{ value | json }}', { value: ['9007199254740993', 9007199254740993n] })).toBe(
      '["9007199254740993",9007199254740993]'
    )
  })

  it('H03: a product projection drops the documented inventory fields', async function () {
    const engine = hosted()
    const product = { handle: 'shoe', variants: [{ id: 1, price: 100, inventory_quantity: 7 }], inventory_quantity: 9 }
    expect(await engine.parseAndRender('{{ p | json }}', { p: product })).toBe(
      '{"handle":"shoe","variants":[{"id":1,"price":100}]}'
    )
    // a plain object keeps every field
    expect(await engine.parseAndRender('{{ p | json }}', { p: { inventory_quantity: 9 } })).toBe(
      '{"inventory_quantity":9}'
    )
  })

  it('H04: the hosted json takes no arguments and jsonify is not a hosted name', async function () {
    const engine = hosted()
    expect(engine.filters['jsonify']).toBeUndefined()
    expect(await engine.parseAndRender('{{ v | json }}', { v: { a: 1 } })).toBe('{"a":1}')
  })

  it('H05: hash vectors match, with the key in the documented position', async function () {
    const engine = hosted()
    expect(await engine.parseAndRender('{{ "abc" | sha256 }}')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(await engine.parseAndRender('{{ "abc" | sha1 }}')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
    expect(await engine.parseAndRender('{{ "abc" | md5 }}')).toBe('900150983cd24fb0d6963f7d28e17f72')
    // RFC 4231 test case 1
    expect(await engine.parseAndRender('{{ "Hi There" | hmac_sha256: k }}', { k: '\x0b'.repeat(20) })).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    )
    expect(await engine.parseAndRender('{{ "Hi There" | hmac_sha1: k }}', { k: '\x0b'.repeat(20) })).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00'
    )
  })

  it('H06: crypto argument edge cases are recorded, not invented', async function () {
    const engine = hosted()
    // a nil key hashes as the empty key rather than failing
    expect(await engine.parseAndRender('{{ "a" | hmac_sha256: nil }}')).toBe(
      await engine.parseAndRender('{{ "a" | hmac_sha256: "" }}')
    )
    // a non-string input is stringified first
    expect(await engine.parseAndRender('{{ 1 | sha256 }}')).toBe(await engine.parseAndRender('{{ "1" | sha256 }}'))
    expect(await engine.parseAndRender('{{ nil | sha256 }}')).toBe(await engine.parseAndRender('{{ "" | sha256 }}'))
  })

  it('H07: every hash name has its own output', async function () {
    const engine = hosted()
    const digests = await Promise.all(
      ['md5', 'sha1', 'sha256', 'blake3'].map(async name => await engine.parseAndRender(`{{ "abc" | ${name} }}`))
    )
    expect(new Set(digests).size).toBe(4)
    expect(await engine.parseAndRender('{{ "abc" | blake3 }}')).toBe(
      '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85'
    )
    expect(await engine.parseAndRender('{{ "" | blake3 }}')).toBe(
      'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'
    )
  })

  it('H08: digests are lowercase hex over UTF-8 bytes on sync and async paths', async function () {
    const engine = hosted()
    const src = '{{ "héllo" | sha256 }}'
    const asyncDigest = await engine.parseAndRender(src)
    expect(asyncDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(await engine.parseAndRender(src)).toBe(asyncDigest)
    expect(await engine.parseAndRender('{{ "héllo" | blake3 }}')).toBe(
      await engine.parseAndRender('{{ "héllo" | blake3 }}')
    )
  })

  it('H28: localized date formats resolve from locale files and built-ins', async function () {
    const engine = hosted({
      locale: 'en',
      locales: { en: { dateFormats: { custom: '%Y!%m' } } }
    })
    expect(await engine.parseAndRender('{{ "2022-12-08" | date: format: "abbreviated_date" }}')).toBe('Dec 08, 2022')
    expect(await engine.parseAndRender('{{ "2022-12-08" | date: format: "custom" }}')).toBe('2022!12')
    // an unknown format name returns the input and is reported, not guessed
    expect(await engine.parseAndRender('{{ "2022-12-08" | date: format: "nope" }}')).toBe('2022-12-08')
    // positional core behaviour is unchanged
    expect(await engine.parseAndRender('{{ "2022-12-08" | date: "%Y" }}')).toBe('2022')
  })

  it('H29: translate and t resolve the same key and arguments', async function () {
    const engine = hosted({
      locale: 'en',
      locales: {
        en: {
          translations: {
            greeting: 'Hello, {{ name }}!',
            products: { one: '1 product', other: '{{ count }} products' }
          }
        }
      }
    })
    expect(await engine.parseAndRender('{{ "greeting" | t: name: "Bob" }}')).toBe('Hello, Bob!')
    expect(await engine.parseAndRender('{{ "greeting" | translate: name: "Bob" }}')).toBe('Hello, Bob!')
    expect(await engine.parseAndRender('{{ "products" | t: count: 1 }}')).toBe('1 product')
    expect(await engine.parseAndRender('{{ "products" | t: count: 5 }}')).toBe('5 products')
    expect(await engine.parseAndRender('{{ "missing.key" | t }}')).toBe('translation missing: missing.key')
  })

  it('H30: handleize and handle agree, and slugify is not a hosted name', async function () {
    const engine = hosted()
    expect(engine.filters['slugify']).toBeUndefined()
    for (const src of ['Hello World!', 'Café & Crème', '  a--b  ']) {
      expect(await engine.parseAndRender('{{ s | handleize }}', { s: src })).toBe(
        await engine.parseAndRender('{{ s | handle }}', { s: src })
      )
    }
    expect(await engine.parseAndRender('{{ "Café & Crème" | handle }}')).toBe('cafe-creme')
  })

  it('H31: string, URL, color and HTML helpers have exact outputs', async function () {
    const engine = hosted()
    expect(await engine.parseAndRender('{{ "hello world" | camelize }}')).toBe('HelloWorld')
    expect(await engine.parseAndRender('{{ 1 | pluralize: "item", "items" }}')).toBe('item')
    expect(await engine.parseAndRender('{{ 2 | pluralize: "item", "items" }}')).toBe('items')
    expect(await engine.parseAndRender('{{ "a b&c" | url_param_escape }}')).toBe('a%20b%26c')
    expect(await engine.parseAndRender('{{ "/a b" | url_escape }}')).toBe('/a%20b')

    expect(await engine.parseAndRender('{{ "#7ab55c" | color_to_rgb }}')).toBe('rgb(122, 181, 92)')
    expect(await engine.parseAndRender('{{ "rgb(122, 181, 92)" | color_to_hex }}')).toBe('#7ab55c')
    expect(await engine.parseAndRender('{{ "#7ab55c" | color_extract: "red" }}')).toBe('122')
    expect(await engine.parseAndRender('{{ "#000000" | color_modify: "red", 255 }}')).toBe('#ff0000')
    expect(await engine.parseAndRender('{{ "#000" | color_contrast: "#fff" }}')).toBe('21')
    expect(await engine.parseAndRender('{{ "#7ab55c" | hex_to_rgba: 0.5 }}')).toBe('rgba(122, 181, 92, 0.5)')
    expect(await engine.parseAndRender('{{ "#000" | color_mix: "#fff", 50 }}')).toBe('#808080')
    expect(await engine.parseAndRender('{{ "not a color" | color_to_hex }}')).toBe('')

    expect(await engine.parseAndRender('{{ c | class_list }}', { c: ['a', '', 'b'] })).toBe('a b')
    expect(await engine.parseAndRender('{{ "x" | link_to: "/p", "T" }}')).toBe('<a href="/p" title="T">x</a>')
    expect(await engine.parseAndRender('{{ "/t.css" | stylesheet_tag }}')).toBe(
      '<link href="/t.css" rel="stylesheet" type="text/css" media="all" />'
    )
    expect(await engine.parseAndRender('{{ "/t.js" | script_tag }}')).toBe(
      '<script src="/t.js" type="text/javascript"></script>'
    )
    expect(await engine.parseAndRender('{{ "one two" | highlight: "two" }}')).toBe(
      'one <strong class="highlight">two</strong>'
    )
  })

  it('H31: money formatting follows the locale bundle', async function () {
    const shop = hosted({
      locale: 'en',
      locales: { en: { moneyFormat: '£{{amount}}', moneyWithCurrencyFormat: '£{{amount}} GBP' } }
    })
    expect(await shop.parseAndRender('{{ 1999 | money }}')).toBe('£19.99')
    expect(await shop.parseAndRender('{{ 1999 | money_with_currency }}')).toBe('£19.99 GBP')
    expect(await shop.parseAndRender('{{ 2000 | money_without_trailing_zeros }}')).toBe('£20')
    expect(await shop.parseAndRender('{{ 1999 | money_without_currency }}')).toBe('19.99')
    expect(await shop.parseAndRender('{{ 1000 | weight_with_unit: "kg" }}')).toBe('1 kg')
  })

  it('H39: a filter needing a provider reports the missing capability', async function () {
    const engine = hosted()
    await expect(engine.parseAndRender('{{ "a.js" | inline_asset_content }}')).rejects.toThrow(
      /unsupported capability "inline_asset_content"/
    )
  })
})
