---
title: Setup
---

In case you're not familiar with Liquid Template Language, see [Introduction to Liquid Template Language](./intro-to-liquid.md).

## LiquidJS in Node.js

Install via npm:

```bash
npm install --save @chr33s/liquid
```

```javascript
import { Liquid } from '@chr33s/liquid';
const engine = new Liquid();

engine
    .parseAndRender('{{name | capitalize}}', {name: 'alice'})
    .then(console.log);     // outputs 'Alice'
```

LiquidJS ships as ES Modules and requires Node.js >= 22.12. CommonJS projects can still load it with `require()`, which resolves to a thin adapter around the same ES Module:

```javascript
const { Liquid } = require('@chr33s/liquid');
```

Both entries share a single module instance, so classes like `Drop` and `Tag` compare equal (`instanceof`) no matter how each part of your program loads LiquidJS. See [Migrate to LiquidJS 11](./migrate-to-11.md) for details.

> **Working Demo**
>
> Here's a working demo for LiquidJS usage in Node.js: <a href="https://github.com/chr33s/liquid/tree/main/demo/nodejs/" target="_blank">demo/nodejs/</a>.

Type definitions for LiquidJS are also exported and published, which makes it more enjoyable for TypeScript projects:

```typescript
import { Liquid } from '@chr33s/liquid';
const engine = new Liquid();

engine
    .parseAndRender('{{name | capitalize}}', {name: 'alice'})
    .then(console.log);     // outputs 'Alice'
```

> **Working Demo**
>
> Here's a working demo for LiquidJS usage in TypeScript: <a href="https://github.com/chr33s/liquid/tree/main/demo/typescript/" target="_blank">demo/typescript/</a>.

## LiquidJS in Browsers

Pre-built UMD bundles are also available:

```html
<!--for production-->
<script src="https://cdn.jsdelivr.net/npm/@chr33s/liquid/dist/liquid.browser.min.js"></script>
<!--for development-->
<script src="https://cdn.jsdelivr.net/npm/@chr33s/liquid/dist/liquid.browser.umd.js"></script>
```

> **Working Demo**
>
> Here's a live demo on jsFiddle: <a href="https://jsfiddle.net/pd4jhzLs/1/" target="_blank">jsfiddle.net/pd4jhzLs/1/</a>, and the source code is also available in <a href="https://github.com/chr33s/liquid/tree/main/demo/browser/" target="_blank">demo/browser/</a>.

> **Compatibility**
>
> You may need a <a href="https://github.com/taylorhakes/promise-polyfill" target="_blank">Promise polyfill</a> for legacy browsers like IE and Android UC, see <a href="https://caniuse.com/#feat=promises" target="_blank">caniuse statistics</a>.

## LiquidJS in CLI

LiquidJS can also be used to render a template directly from CLI using `npx`. Pass the template as a positional argument:

```bash
npx liquidjs '{{"hello" | capitalize}}'
```

You can either pass the template inline (as shown above), read it from a file with `@` followed by a path, or from `stdin` with `@-`:

```bash
npx liquidjs @./some-template.liquid
echo '{{"hello" | capitalize}}' | npx liquidjs @-
```

A context can be passed the same ways (inline, from a path, or via `@-` for `stdin`). The following three are equivalent:

```bash
npx liquidjs 'Hello, {{ name }}!' --context '{"name": "Snake"}'
npx liquidjs 'Hello, {{ name }}!' --context @./some-context.json
echo '{"name": "Snake"}' | npx liquidjs 'Hello, {{ name }}!' --context @-
```

Note that you can only use the `stdin` specifier `@-` for a single argument. If you try to use it for both the template and `--context` you will get an error.

The rendered output is written to `stdout` by default, but you can also specify an output file (if the file exists, it will be overwritten):

```bash
npx liquidjs '{{"hello" | capitalize}}' --output ./hello.txt
```

You can also pass a number of options to customize template rendering behavior. For example, the `--js-truthy` option can be used to enable JavaScript truthiness:

```bash
npx liquidjs @./some-template.liquid --js-truthy
```

Most of the [options available through the JavaScript API](./options.md) are also available from the CLI. For help on available options, use `npx liquidjs --help`.

## Miscellaneous

Runnable integrations: <a href="https://github.com/chr33s/liquid/tree/main/demo/srvx/" target="_blank">demo/srvx/</a> renders templates from an <a href="https://srvx.h3.dev" target="_blank">srvx</a> server, and <a href="https://github.com/chr33s/liquid/tree/main/demo/vite/" target="_blank">demo/vite/</a> is an all-ESM Vite and React app.
