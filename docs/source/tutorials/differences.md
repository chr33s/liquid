---
title: Differences with Shopify Liquid
---

## Compatibility

Being compatible with the Ruby version is one of our priorities. Liquid language is originally [implemented in Ruby][ruby-liquid] and used by Shopify and Jekyll (and thus GitHub Pages). As you can see it's one of the most popular template engines in Ruby. There are lots of people using LiquidJS to serve their templates originally written for Shopify themes and Jekyll sites.

So "being compatible" means serving developers from Shopify and Jekyll well:

- **Well-formed Liquid template should work just fine in LiquidJS**. For example, `forloop.index` should be 1-indexed, `nil` should be rendered as empty string rather than `undefined`, etc. Although some features (e.g. [#236][#236]) are not feasible in JavaScript, at least we're trying to implement all the semantics of Liquid language.
- **All filters and tags in [shopify/liquid][ruby-liquid] are supposed to be built in LiquidJS**. But not those business-logic specific tags/filters typically defined by Shopify platform. Those features should be maintained as [plugins](./plugins.md). For filters/tags that are not business-logic specific and extremely useful, feel free to file an issue.

In the meantime, it's now implemented in JavaScript, that means it has to be more powerful:

* **Async as a first-class citizen**. Filters and tags can be implemented asynchronously by returning a `Promise`.
* **[Abstract file system](./render-file.md)**. Along with async feature, LiquidJS can be used to serve templates stored in Databases [#414][#414], on remote HTTP server [#485][#485], and so on.
* **Two dialects**. The default `core` profile is the reference engine; the [`shopify_theme` profile](./shopify-theme-profile.md) adds the documented hosted theme tags, filters and limits.

## Differences

Though we're trying to be compatible with the Ruby version, there are still some differences:

* Truthy and Falsy. All values except `undefined`, `null`, `false` are truthy, whereas in Ruby Liquid all except `nil` and `false` are truthy. See [#26][#26].
* Number. In JavaScript we cannot distinguish `float` from `integer` in data, see [#59][#59]. A decimal written in the template, or a decimal string like `"2.0"`, keeps its decimal kind, so `{{ 7.0 }}` renders `7.0` and `{{ 7 | divided_by: "2.0" }}` is `3.5`. A number passed in from JavaScript carries no kind: `7.0` from the host is the integer `7`. To keep it a decimal, pass a {@link FloatDrop} (`new FloatDrop(7)`), exported from the package root, which renders `7.0` and divides as a decimal. The `size` filter gives 8 for an integer and 0 for a decimal, as in Ruby.
* Stringify: a filter reads an array or hash input as Ruby's `inspect` prints it, so `{{ array | strip }}` is `["a", "b"]` and a hash reads `{"a"=>1}`, as in Shopify/liquid [#852][#852]. `{{ array }}` still renders the items one after another. Floats print as Ruby prints them (`1.0e+15`, `1.0e-05`).
* [.to_liquid()](https://github.com/Shopify/liquid/wiki/Introduction-to-Drops) is replaced by `.toLiquid()`
* [.to_s()](https://www.rubydoc.info/gems/liquid/Liquid/Drop) is replaced by JavaScript `.toString()`
* Iteration order for objects. The iteration order of JavaScript objects, and thus LiquidJS objects, is a combination of the insertion order for string keys, and ascending order for number-like keys, while the iteration order of Ruby Hash is simply the insertion order.
* Sort stability. The [sort](../filters/sort.md) stability is also not defined in both shopify/liquid and LiquidJS, but it's [considered stable][stable-sort] for LiquidJS in Node.js 12+ and Google Chrome 70+.
* Trailing unmatched characters inside filters are allowed in shopify/liquid but not in LiquidJS. It means filter arguments without a colon like `{{ "a b" | split " "}}` will throw an error in LiquidJS. This is intended to improve Liquid usability, see [#208][#208] and [#212][#212].
* LiquidJS keeps a few names beyond [the Liquid language][liquid]:
    * `squish`, and the `dateFormat` and per-call timezone arguments of [date](../filters/date.md), as host adaptations.
    * Everything else was reconciled against the reference engine and the hosted catalog; see [Migrate to v12](./migrate-to-12.md). [layout](../tags/layout.md), `json`, `sha256` and `hmac_sha256` are registered by the [`shopify_theme` profile](./shopify-theme-profile.md) only.
* Some tags/filters behave differently: [date](../filters/date.md) filter, and malformed tags like extra args for `endif` throw errors in LiquidJS. A duplicated `else` is accepted as in the reference: only the first one renders.

[#26]: https://github.com/harttle/liquidjs/pull/26
[#59]: https://github.com/harttle/liquidjs/issues/59
[#208]: https://github.com/harttle/liquidjs/issues/208
[#212]: https://github.com/harttle/liquidjs/issues/212
[#236]: https://github.com/harttle/liquidjs/issues/236
[#414]: https://github.com/harttle/liquidjs/discussions/414
[#485]: https://github.com/harttle/liquidjs/discussions/485
[#852]: https://github.com/harttle/liquidjs/discussions/852
[stable-sort]: https://v8.dev/features/stable-sort
[ruby-liquid]: https://github.com/Shopify/liquid
[liquid]: https://shopify.github.io/liquid/basics/introduction/
[shopify-tags]: https://shopify.dev/docs/api/liquid/tags
[jekyll-filters]: https://jekyllrb.com/docs/liquid/filters/
