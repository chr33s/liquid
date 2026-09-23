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
await engine.parseAndRender('{{ user.name }}', { user: new UserDrop() });
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

## Async-only execution and portable streaming


This is a breaking migration to Promise execution, cancellable operations, and Web text streams. In-memory `parse`, tokenization, registries, and pure filters remain synchronous. There is no blocking compatibility shim.

## Removed execution APIs

Replace each method below with `await` and the same name without `Sync`:

- `renderSync`, `parseAndRenderSync`, `parseFileSync`, `renderFileSync`, `evalValueSync`
- `analyzeSync`, `parseAndAnalyzeSync`
- `variablesSync`, `fullVariablesSync`, `variableSegmentsSync`
- `globalVariablesSync`, `globalFullVariablesSync`, `globalVariableSegmentsSync`

Standalone `analyzeSync`, `Context.getSync`, `toValueSync`, `toLiquidAsync`, and `LiquidAsync` are removed. `Context.get` and `getFromScope` now return Promises. Generator extensions can continue yielding `_get` and `_getFromScope`. Execution mode flags are removed; stale JavaScript `sync` properties have no effect. Integrations requiring synchronous callbacks must precompute their output or remain on the previous major.

Combined parse/render and parse/analyze errors reject the returned Promise. `parse` alone still throws immediately. Analysis remains asynchronous with `{ partials: false }`, which prevents dependency I/O.

## Operation options and cancellation

`OperationOptions` contains `signal?: AbortSignal`. Rendering and analysis accept it through their existing options. `parseFile(file, lookupType?, options?)` and `evalValue(expression, scope?, options?)` append options. Root `toPromise(value, options?)` also accepts cancellation. `Template.children(partials, options?)` replaces the positional execution-mode argument; forward those options when loading dependencies.

```javascript
const controller = new AbortController()
const rendering = engine.renderFile('page', data, { signal: controller.signal })
controller.abort({ kind: 'navigation' })
try {
  await rendering
} catch (error) {
  if (error !== controller.signal.reason) throw error
}
```

Cancellation preserves the exact reason, including primitives and object identity, and bypasses ordinary error aggregation. The engine stops waiting on ordinary providers, observes late rejection, and unwinds generator finalizers from inside out. Cleanup may yield. A `finally` block that is already suspended at a `yield` when cancellation arrives resumes with a return completion, so its remaining statements are skipped; release state before the first `yield` in a `finally`. A finalizer that never settles can prevent cleanup completion. External async extensions may continue their own side effects; cancellation does not terminate them or make a retained context safe for concurrent reuse.

The shared driver offers host tasks a turn after at most 1,024 checkpoints, checking elapsed work every 64 checkpoints against an 8 ms target. These are cooperative scheduling targets, not latency guarantees or CPU preemption. Individual synchronous parsing/filter calls remain non-preemptible.

Overlapping same-key cached loads have an independent owner. Cancelling one waiter does not cancel another waiter or poison the cache. Shared work may finish populating the cache after all waiters leave. Use a new engine/cache scope when changing source or resolution policy.

## Awaitable writers and Web streams

Replace Node-stream methods with `renderToStream(templates, scope?, options?)` and `await renderFileToStream(file, scope?, options?)`. Both produce `ReadableStream<string>`. The former reports setup/render failures through its stream. The latter rejects initial file lookup/read/parse failures; later failures error the stream.

Direct-writing extensions must yield or await every `emitter.write`. Overlapping unresolved writes fail. Completion means acceptance by the sink, not delivery to a network peer. Collecting emitters expose accumulated `buffer`; streaming emitters leave it empty. Captures and layout composition still require intermediate strings.

The text queue is measured in UTF-16 code units: threshold 65,536, maximum chunk 16,384, no coalescing buffer. Queued text is bounded by 81,920 units plus at most one staging chunk of 16,384. A pending writer can retain its original string. Source/AST storage, captured strings, and extension allocations are outside that queue bound. Output budgets remain cumulative; consuming chunks does not replenish them. Chunk boundaries are not stable API.

An unused large stream stops at backpressure. Cancel it through its reader when locked. Cancellation waits for owned cleanup, excluding independent cache work. Errors cannot retract consumed chunks; no error page is appended and no retry is automatic. Buffer the entire render before sending if atomic output is required.

Always encode before passing text to a byte transport. Stateful encoding preserves surrogate pairs split across chunks:

```javascript
const text = await engine.renderFileToStream('page', data, { signal: request.signal })
return new Response(text.pipeThrough(new TextEncoderStream()), {
  headers: { 'content-type': 'text/html; charset=utf-8' }
})
```

For Node HTTP, encoding precedes the consumer-owned adapter. `pipeline` propagates destination failure upstream:

```javascript
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
const text = await engine.renderFileToStream('page', data)
await pipeline(Readable.fromWeb(text.pipeThrough(new TextEncoderStream())), response)
```

## File providers, limits, and browser URLs

FS providers expose receiver-bound `exists(path, options?)`, `readFile(path, options?)`, and optional `contains(root, path, options?)`; remove their Sync counterparts. They may return immediate values or Promises. `resolve`, `dirname`, and `fallback` remain synchronous. Declare missing files with `code: 'ENOENT'` or `ENOTDIR`. Only classified absence tries the next candidate. Permissions, parse errors, source limits, network/CORS failures, and non-404 HTTP errors fail.

`sourceByteLimit` defaults to `Infinity` and must be a nonnegative safe integer or Infinity. It applies per template read before decoding (Fetch counts delivered, decompressed body bytes). `parseLimit` retains its parser-lifetime UTF-16 accounting; the derived `FileReadOptions.sourceCodeUnitLimit` permits early rejection without a second charge. Built-in byte adapters read incrementally under finite limits. Custom providers returning complete strings own allocation and raw-byte enforcement; the engine checks decoded length afterward. Map strings are already allocated. Unbounded defaults do not imply bounded input memory.

Browser loading now uses Fetch with same-origin credentials and UTF-8 replacement/BOM decoding, regardless of response charset. Legacy non-UTF-8 endpoints need a custom FS/decoder. Non-OK bodies are cancelled, not rendered. HTTP 404 permits fallback; HTTP 410 and other failures do not.

The default browser adapter resolves with `URL`, without DOM mutation. Supply an absolute `baseUrl`, or the adapter snapshots `document.baseURI` at construction. Explicit bases require no DOM access. With no base, absolute URLs work; relative loading fails when resolution is attempted. Roots are directories, extensions apply to the final pathname segment before query/fragment, and directory URLs drop the original file's query/fragment. Later document-base changes do not retarget an engine. Node/map/custom FS policies are unchanged by `baseUrl`; explicit `templates` take precedence.

The intended worker subset is in-memory rendering/streaming and explicit-base Fetch loading with native Web APIs. This is not a compatibility claim for every provider, plugin, or edge runtime; see the implementation validation record for executed qualification.

## Release metadata

This migration requires a breaking major release through the existing semantic-release workflow. A release commit should use a conventional breaking title such as `feat!: make execution async-only with cancellation and Web streams` and a `BREAKING CHANGE:` footer describing removed APIs, awaitable writes, and loading policy changes. The package version remains under release automation; this implementation does not publish a release.
