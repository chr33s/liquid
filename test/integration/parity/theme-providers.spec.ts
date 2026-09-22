import { Liquid } from '../../../src/liquid'
import type { ThemeProviders } from '../../../src/theme'
import { mock, restore } from '../../stub/mockfs'

function theme(files: Record<string, string>, providers: ThemeProviders = {}) {
  mock(Object.fromEntries(Object.entries(files).map(([name, content]) => [`/theme/${name}`, content])))
  return new Liquid({
    profile: 'shopify_theme',
    root: '/theme',
    partials: '/theme',
    layouts: '/theme/layout',
    extname: '.liquid',
    theme: providers
  })
}

const storeProvider: ThemeProviders = {
  request: { path: '/cart', query: {} },
  store: {
    formAction: (type: string) => (type === 'cart' ? '/cart' : `/account/${type}`),
    formInputs: (type: string): Record<string, string> =>
      type === 'cart' ? { form_type: 'cart', utf8: '✓' } : { form_type: type },
    platformMarkup: (name: string) => `<${name} />`
  }
}

describe('parity: store, asset and form providers', function () {
  it('exposes theme globals and settings in isolated partials with scope overrides', async function () {
    const read = '{{ shop.name }}|{{ settings.color }}'
    const engine = new Liquid({
      profile: 'shopify_theme',
      strictVariables: true,
      templates: { snippet: read },
      theme: { settings: { color: 'red' }, store: { globals: { shop: { name: 'Acme' } } } }
    })
    const source = read + '/{% render "snippet" %}'
    expect(await engine.parseAndRender(source)).toBe('Acme|red/Acme|red')
    expect(await engine.parseAndRender(source, { shop: { name: 'Local' }, settings: { color: 'blue' } })).toBe(
      'Local|blue/Acme|red'
    )
    expect(await engine.parseAndRender(source, {}, { globals: { shop: { name: 'Global' } } })).toBe(
      'Global|red/Global|red'
    )
    expect(
      await engine.parseAndRender(
        source,
        {},
        {
          theme: { settings: { color: 'green' }, store: { globals: { shop: { name: 'Other' } } } }
        }
      )
    ).toBe('Other|green/Other|green')
  })

  afterEach(restore)

  it('awaits theme providers before rendering their results', async function () {
    const engine = theme(
      {},
      {
        assets: {
          assetUrl: async path => `/assets/${path}`,
          fileUrl: async path => `/files/${path}`,
          shopifyAssetUrl: async path => `/shared/${path}`,
          imageUrl: async (_image, options) => `/image-${options.width}`,
          inlineAsset: async () => 'contents',
          fontUrl: async () => '/font',
          fontFace: async () => '@font-face{}',
          fontModify: async () => 'modified'
        },
        appBlock: async () => '<aside>app</aside>',
        store: {
          formAction: async () => '/cart',
          formInputs: async () => ({ form_type: 'cart' }),
          platformMarkup: async name => `<${name} />`,
          paginate: async () => ({ size: 2, slice: async () => ['one', 'two'] })
        }
      }
    )
    const cases = [
      ['{{ "a" | asset_url }}', '/assets/a'],
      ['{{ "a" | file_url }}', '/files/a'],
      ['{{ "a" | global_asset_url }}', '/shared/a'],
      ['{{ "a" | shopify_asset_url }}', '/shared/a'],
      ['{{ "a" | image_url: width: 20 }}', '/image-20'],
      ['{{ "a" | img_url: "small", width: 30 }}', '/image-30'],
      ['{{ "a" | inline_asset_content }}', 'contents'],
      ['{{ "a" | font_url }}', '/font'],
      ['{{ "a" | font_face }}', '@font-face{}'],
      ['{{ "a" | font_modify: "weight", "bold" }}', 'modified'],
      ['{% render block %}', '<aside>app</aside>'],
      ['{{ nil | payment_button }}', '<payment_button />'],
      [
        '{% form "cart" %}{% endform %}',
        '<form method="post" action="/cart"><input type="hidden" name="form_type" value="cart" /></form>'
      ],
      ['{% paginate items by 2 %}{{ items | join: "," }}{% endpaginate %}', 'one,two']
    ]
    for (const [source, expected] of cases) {
      expect(await engine.parseAndRender(source, { items: [], block: {} })).toBe(expected)
    }
  })

  it.each(['asset_url', 'inline_asset_content', 'payment_button'])(
    'reports an absent asynchronous %s result as a missing capability',
    async filter => {
      const engine = theme(
        {},
        {
          assets: { assetUrl: async () => undefined, inlineAsset: async () => undefined },
          store: { platformMarkup: async () => undefined }
        }
      )
      await expect(engine.parseAndRender(`{{ "a" | ${filter} }}`)).rejects.toThrow(`unsupported capability "${filter}"`)
    }
  )

  it('propagates provider rejections and cancels pending provider calls', async function () {
    const controller = new AbortController()
    let entered!: () => void
    const ready = new Promise<void>(resolve => {
      entered = resolve
    })
    const engine = theme(
      {},
      {
        assets: {
          fileUrl: async () => {
            throw new Error('provider offline')
          },
          assetUrl: () => {
            entered()
            return new Promise<string>(() => {})
          }
        }
      }
    )
    await expect(engine.parseAndRender('{{ "a" | file_url }}')).rejects.toThrow('provider offline')
    const result = engine.parseAndRender('{{ "a" | asset_url }}', {}, { signal: controller.signal })
    const rejected = expect(result).rejects.toBe('stop')
    await ready
    controller.abort('stop')
    await rejected
  })

  it('H21: each form type gets its action, method, hidden inputs and attributes', async function () {
    const engine = theme(
      { 'index.liquid': '{% form "cart", cart, class: "c", id: "f1" %}BODY{% endform %}' },
      storeProvider
    )
    expect(await engine.renderFile('index', { cart: {} })).toBe(
      '<form method="post" action="/cart" class="c" id="f1">' +
        '<input type="hidden" name="form_type" value="cart" />' +
        '<input type="hidden" name="utf8" value="✓" />' +
        'BODY</form>'
    )
  })

  it('H21: the form drop is scoped to the block', async function () {
    const engine = theme(
      { 'index.liquid': '{% form "contact" %}[{{ form.id }}]{% endform %}[{{ form.id }}]' },
      storeProvider
    )
    expect(await engine.renderFile('index')).toBe(
      '<form method="post" action="/account/contact">' +
        '<input type="hidden" name="form_type" value="contact" />' +
        '[contact]</form>[]'
    )
  })

  it('H21: an unknown form type is rejected', async function () {
    const engine = theme({ 'index.liquid': '{% form "nope" %}{% endform %}' }, storeProvider)
    await expect(engine.renderFile('index')).rejects.toThrow(/unknown form type "nope"/)
  })

  it('H22: errors and posted state come from the request, never fabricated', async function () {
    const src = '{% form "contact" %}{{ form.posted_successfully }}|{{ form.errors | default_errors }}{% endform %}'
    const quiet = theme({ 'index.liquid': src }, storeProvider)
    expect(await quiet.renderFile('index')).toContain('false|')

    const posted = theme(
      { 'index.liquid': src },
      {
        ...storeProvider,
        request: { path: '/', query: {}, posted_successfully: true, form_errors: { email: ['is invalid'] } }
      }
    )
    const html = await posted.renderFile('index')
    expect(html).toContain('true|<ul class="errors"><li>is invalid</li></ul>')
  })

  it('H22: a form without a store provider is reported as unsupported', async function () {
    const engine = theme({ 'index.liquid': '{% form "cart" %}{% endform %}' })
    await expect(engine.renderFile('index')).rejects.toThrow(/unsupported capability "form"/)
  })

  it('H32: money, units and locale come from the locale bundle', async function () {
    const engine = theme({}, { locale: 'fr', locales: { fr: { moneyFormat: '{{amount_with_comma_separator}} €' } } })
    expect(await engine.parseAndRender('{{ 123456 | money }}')).toBe('1.234,56 €')
    expect(await engine.parseAndRender('{{ 454 | weight_with_unit: "lb" }}')).toBe('1.0 lb')
    expect(
      await engine.parseAndRender('{{ 500 | unit_price_with_measurement: m }}', {
        m: { quantity_value: 100, quantity_unit: 'ml' }
      })
    ).toBe('5,00 €/100 ml')
  })

  it('H33: asset and media filters go through the asset provider', async function () {
    const engine = theme(
      {},
      {
        assets: {
          assetUrl: (path: string) => `https://cdn.example/assets/${path}?v=1`,
          imageUrl: (image: any, options: any) => `https://cdn.example/${image.name}_${options.width}.jpg`,
          inlineAsset: (path: string) => `/* ${path} */`
        }
      }
    )
    expect(await engine.parseAndRender('{{ "theme.css" | asset_url }}')).toBe(
      'https://cdn.example/assets/theme.css?v=1'
    )
    expect(await engine.parseAndRender('{{ i | image_url: width: 200 }}', { i: { name: 'shoe' } })).toBe(
      'https://cdn.example/shoe_200.jpg'
    )
    expect(await engine.parseAndRender('{{ "a.js" | inline_asset_content }}')).toBe('/* a.js */')
    expect(await engine.parseAndRender('{{ "/s.jpg" | image_tag: alt: "A" }}')).toBe('<img src="/s.jpg" alt="A" />')
  })

  it('H33: a missing asset provider is reported, not faked', async function () {
    const engine = theme({})
    await expect(engine.parseAndRender('{{ "theme.css" | asset_url }}')).rejects.toThrow(
      /unsupported capability "asset_url"/
    )
    await expect(engine.parseAndRender('{{ f | font_url }}', { f: {} })).rejects.toThrow(
      /unsupported capability "font_url"/
    )
  })

  it('H34: cart helpers read cart data and platform markup stays opaque', async function () {
    const engine = theme({}, storeProvider)
    const cart = {
      items: [
        { variant_id: 1, product_id: 9, quantity: 2 },
        { variant_id: 2, product_id: 9, quantity: 3 }
      ]
    }
    expect(await engine.parseAndRender('{{ cart | item_count_for_variant: 1 }}', { cart })).toBe('2')
    expect(
      await engine.parseAndRender('{{ cart | line_items_for: p | size }}', { cart, p: { id: 9, variants: [] } })
    ).toBe('2')
    expect(await engine.parseAndRender('{{ p | payment_button }}', { p: {} })).toBe('<payment_button />')
    expect(await engine.parseAndRender('{{ "Log in" | customer_login_link }}')).toBe(
      '<a href="/account/login">Log in</a>'
    )
  })

  it('H34: commerce markup without a provider is unsupported', async function () {
    const engine = theme({})
    await expect(engine.parseAndRender('{{ p | payment_button }}', { p: {} })).rejects.toThrow(
      /unsupported capability "payment_button"/
    )
  })

  it('H35: typed objects follow global, template and render-local visibility', async function () {
    const engine = theme(
      { 'snippets/leaf.liquid': '[{{ shop.name }}][{{ page_title }}]', 'index.liquid': '{% render "snippets/leaf" %}' },
      {}
    )
    expect(await engine.renderFile('index', { page_title: 'T' }, { globals: { shop: { name: 'Acme' } } })).toBe(
      '[Acme][]'
    )
    expect(await engine.parseAndRender('{{ nothing.here }}|{{ nothing }}')).toBe('|')
    expect(await engine.parseAndRender('{% if o == empty %}y{% else %}n{% endif %}', { o: {} })).toBe('y')
    expect(await engine.parseAndRender('{% if s == blank %}y{% else %}n{% endif %}', { s: '  ' })).toBe('y')
  })

  it('H37: deprecated names are tracked apart from retired ones', function () {
    const engine = theme({})
    // documented but deprecated: still available
    for (const name of ['img_url', 'img_tag', 'article_img_url', 'collection_img_url', 'product_img_url']) {
      expect(engine.filters[name]).toBeDefined()
    }
    // retired non-reference names stay absent
    for (const name of ['slugify', 'jsonify', 'cgi_escape']) {
      expect(engine.filters[name]).toBeUndefined()
    }
  })

  it('H38: a cached parse is not reused across profiles or tenants', async function () {
    const files = { '/theme/snippets/leaf.liquid': 'LEAF' }
    mock(files)
    const base = { root: '/theme', partials: '/theme', extname: '.liquid', cache: true } as const
    const a = new Liquid({ ...base, profile: 'shopify_theme', theme: { tenant: 'shop-a' } })
    expect(await a.parseAndRender('{% render "snippets/leaf" %}')).toBe('LEAF')

    mock({ '/theme/snippets/leaf.liquid': 'OTHER' })
    const b = new Liquid({ ...base, profile: 'shopify_theme', theme: { tenant: 'shop-b' } })
    expect(await b.parseAndRender('{% render "snippets/leaf" %}')).toBe('OTHER')
  })

  it('H39: missing capabilities are reported rather than rendering empty output', async function () {
    const engine = theme({ 'index.liquid': '{% sections "header" %}' })
    await expect(engine.renderFile('index')).rejects.toThrow(/unsupported capability/)
  })
})
