---
title: Migrate to LiquidJS 11
---

LiquidJS 11 is published as ES Modules. There is now a single implementation bundle for Node.js instead of separate CommonJS and ESM copies, which removes a class of bugs around duplicated classes. This page covers what changed and what you need to do.

## Node.js >= 22.12

The minimum supported Node.js version is now 22.12. This is the version where `require()` of an ES Module became available without a flag, which is what lets CommonJS projects keep using LiquidJS.

## Both `import` and `require` still work

There is no change to how you load LiquidJS:

```javascript
import { Liquid } from '@chr33s/liquid';
```

```javascript
const { Liquid } = require('@chr33s/liquid');
```

The `require()` entry is a small adapter that re-exports the ES Module, so both forms resolve to the same code.

## One module instance, so `instanceof` is reliable

Previously LiquidJS shipped a CommonJS bundle and an ESM bundle. A project could end up loading both — for example an application using `import` alongside a dependency using `require` — and each copy defined its own `Drop`, `Tag` and `Output` classes. Subclasses registered against one copy failed the `instanceof` checks performed by the other, with no error:

```javascript
class UserDrop extends Drop { /* ... */ }   // from the CommonJS copy
engine.parseAndRenderSync('{{ user.name }}', { user: new UserDrop() });
// engine holds the ESM copy: liquidMethodMissing is never called
```

With a single bundle this cannot happen. If you added workarounds for it — forcing a resolution alias, pinning a bundler to one entry, or replacing `instanceof` with duck typing — they can be removed.

## Removed `package.json` entries

The `main`, `module`, `es2015` and `browser` fields have been removed. Resolution now goes through [`exports`][exports] only:

| Condition | File |
| --- | --- |
| `types` | `dist/index.d.ts` |
| `browser` | `dist/liquid.browser.mjs` |
| `import` | `dist/liquid.node.mjs` |
| `require` | `dist/liquid.node.cjs` |

Bundlers that understand `exports` (webpack 5, Vite, Rollup, esbuild, Parcel 2) need no configuration. Tooling old enough to ignore `exports` will no longer resolve LiquidJS.

`dist/liquid.node.js` is gone; the Node.js bundle is `dist/liquid.node.mjs`. If you imported a bundle by path rather than by package name, update the path.

## Browser bundles are unchanged

The UMD and minified builds keep their names and their global:

```html
<script src="https://cdn.jsdelivr.net/npm/@chr33s/liquid/dist/liquid.browser.min.js"></script>
<script>
  var engine = new window.liquidjs.Liquid();
</script>
```

## CLI

The CLI binary moved to `dist/liquid.cli.mjs`. The `liquidjs` and `liquid` commands are unaffected:

```bash
npx liquidjs '{{ "hello" | capitalize }}'
```

[exports]: https://nodejs.org/api/packages.html#exports
