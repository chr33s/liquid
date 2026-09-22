---
title: hmac_sha256
---

**Since:** vNEXT

> **Theme profile only**
>
> `hmac_sha256` is registered by the [Shopify theme profile](../tutorials/shopify-theme-profile.md) (`profile: 'shopify_theme'`), not by the default `core` profile. A core engine can register it itself: `liquid.registerFilter('hmac_sha256', hostedFilters.hmac_sha256)`, with `hostedFilters` imported from the package root.

Converts a string into an SHA-256 hash using a hash message authentication code (HMAC). The secret key is passed as the filter argument. The output is a lowercase hexadecimal string.

Input

```liquid
{%- assign secret_potion = 'Polyjuice' | hmac_sha256: 'Polina' -%}
My secret potion: {{ secret_potion }}
```

Output

```text
My secret potion: 8e0d5d65cff1242a4af66c8f4a32854fd5fb80edcc8aabe9b302b29c7c71dc20
```
