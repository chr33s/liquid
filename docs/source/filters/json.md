---
title: json
---

**Since:** v9.10.0

> **Theme profile only**
>
> `json` is registered by the [Shopify theme profile](../tutorials/shopify-theme-profile.md) (`profile: 'shopify_theme'`), not by the default `core` profile. A core engine can register it itself: `liquid.registerFilter('json', hostedFilters.json)`, with `hostedFilters` imported from the package root.

Serializes a value as JSON. `nil` is written as `null`, drops are read through their liquid value, and the inventory fields of a product or variant are left out, as in the hosted projection.

Input
```liquid
{% assign arr = "foo bar coo" | split: " " %}
{{ arr | json }}
```

Output
```text
["foo","bar","coo"]
```

There is no `space` argument: since v12, `json: 4` no longer pretty-prints.
