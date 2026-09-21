# @chr33s/liquid

A simple, expressive, extensible Liquid template engine for JavaScript — Shopify, Jekyll and GitHub Pages compatible, for Node.js, browsers, and the CLI, with TypeScript support.

```js
import { Liquid } from '@chr33s/liquid'

const engine = new Liquid()
const html = await engine.parseAndRender(
  'Hello, {{ name | capitalize }}!',
  { name: 'liquid' }
)
//=> 'Hello, Liquid!'
```

## Where to go

- [Tutorials](./source/tutorials/index.md) — setup, options, partials, extension points.
- [Tags](./source/tags/overview.md) — reference for every Liquid tag.
- [Filters](./source/filters/overview.md) — reference for every Liquid filter.
- [Changelog](../CHANGELOG.md) — released versions.
- API reference — the generated TypeScript API, starting at {@link Liquid}.

## Elsewhere

- [Repository](https://github.com/chr33s/liquid) — source, issues and runnable [demos](https://github.com/chr33s/liquid/tree/main/demo).
- [README](https://github.com/chr33s/liquid#readme) — quick start, contributors and sponsors.
- [npm package](https://www.npmjs.com/package/@chr33s/liquid)
