---
title: Truthy and Falsy
---

Though [Liquid][sl] is platform-independent, there are [certain differences][diff] with [the Ruby version][ruby], one of which is the `truthy` value.

## The Truth Table

According to [Shopify document](https://shopify.github.io/liquid/basics/truthy-and-falsy/) everything other than `false` and `nil` is truthy. In JavaScript we also have `undefined`, which is treated as `nil`:

value          | truthy | falsy
---            | ---    | ---
`true`         | ✔️      |
`false`        |        | ✔️
`null`         |        | ✔️
`undefined`    |        | ✔️
`string`       | ✔️      |
`empty string` | ✔️      |
`0`            | ✔️      |
`integer`      | ✔️      |
`float`	       | ✔️      |
`array`        | ✔️      |
`empty array`  | ✔️      |

This is the only truthiness LiquidJS implements. The `jsTruthy` option, which switched to JavaScript truthiness, was removed in v12; see [Migrate to v12](./migrate-to-12.md).

[ruby]: https://shopify.github.io/liquid
[sl]: https://www.npmjs.com/package/@chr33s/liquid
[diff]: https://github.com/chr33s/liquid#differences-and-limitations
