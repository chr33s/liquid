---
title: Shopify Theme Profile
---

**Since:** v12.0.0

LiquidJS renders two dialects, selected by the `profile` option:

- `"core"` (default) — the reference Ruby engine.
- `"shopify_theme"` — core plus the documented Shopify theme dialect: its tags, its filters and its limits.

```javascript
const engine = new Liquid({ profile: 'shopify_theme', theme: { /* providers */ } })
```

## What the theme profile adds

Tags: `{% layout %}`, `{% paginate %}`, `{% section %}`, `{% sections %}`, `{% content_for %}`, `{% schema %}`, `{% style %}`, `{% stylesheet %}`, `{% javascript %}`, `{% form %}`.

Filters: `json` and the hosted crypto (`sha256`, `hmac_sha256`, …), string, color, HTML, localization, money, media, asset and commerce families. Hosted-only names are not registered in the core profile, so a core render fails on them exactly as the reference engine does.

The core profile registers exactly the tags and filters of the pinned Ruby reference. A core engine can still opt into a single hosted name without the rest of the dialect:

```javascript
import { Liquid, LayoutTag, hostedFilters } from '@chr33s/liquid'

const engine = new Liquid()
engine.registerTag('layout', LayoutTag)
engine.registerFilter('sha256', hostedFilters.sha256)
```

Limits: an ordinary `{% for %}` over an array without `limit:` renders at most 50 items (a range renders in full), pagination accepts page sizes from 1 to 250, and pagination reaches at most 25,000 items.

## Providers

The template language cannot invent store data. Anything that depends on the platform — asset URLs, money formats, translations, form actions, paginated collections, platform-owned markup — comes from the `theme` option:

```javascript
const engine = new Liquid({
  profile: 'shopify_theme',
  theme: {
    request: { path: '/collections/all', query: { page: '2' } },
    locale: 'en',
    locales: { en: { translations: { greeting: 'Hello, {{ name }}!' }, moneyFormat: '${{amount}}' } },
    assets: { assetUrl: path => `https://cdn.example/assets/${path}` },
    appBlock: block => `<div class="app-block">${block.id}</div>`,
    store: {
      formAction: type => `/${type}`,
      paginate: collection => ({ size: collection.count, slice: (from, to) => collection.load(from, to) })
    },
    tenant: 'shop-a'
  }
})
```

A capability with no provider is reported, not faked: the filter or tag throws a `MissingCapabilityError` and the render's `capabilities` log records it as `provider_required`. Nothing returns an empty string in place of data it does not have.

Provider methods may return values or Promises. Rendering waits for each result and propagates provider failures. A render's abort signal also cancels its wait for a pending provider result.

`tenant` takes part in the template cache key, so one shop's cached parse is never reused for another.

`appBlock` renders an app block for `{% render block %}`, the form Shopify's app blocks use; outside this profile a template name must still be a quoted string.

A section's settings, and those of its blocks, fall back to the `default` their `{% schema %}` declares when the section definition does not set them.

The storefront trims whitespace with the reference's `bug_compatible_whitespace_trimming`: set {@link LiquidOptions.bugCompatibleWhitespaceTrimming | bugCompatibleWhitespaceTrimming} to match it. It is off by default, as Shopify's recorded compiler tests expect. See [Whitespace Control](./whitespace-control.md).

## Reading what a build supports

`buildCompatibilityManifest()` reports every registered name, where it came from, which profiles carry it, and whether it needs a provider:

```javascript
import { buildCompatibilityManifest } from '@chr33s/liquid'

const manifest = buildCompatibilityManifest()
manifest.filters.asset_url // { provenance: 'hosted', profiles: ['shopify_theme'], status: 'provider_required', provider: 'assets.assetUrl' }
```

`npm run build:compat` writes the same data to `liquid-compatibility-manifest.json`.

> **Parity is not certified**
>
> The hosted behaviour here is implemented from the public Shopify Liquid reference reviewed on 2026-09-21 and the theme-liquid-docs catalog. `npm run test:spec` runs this profile against the liquid-spec corpus, whose `shopify_production_recordings` were recorded from Shopify production; its `shopify_theme_dawn` fixtures are listed as known failures, as they render Dawn snippets, translations and theme settings the corpus does not ship. No run against a live Shopify store is claimed, and no hosted runtime revision is inferred.
