---
title: API Stability
---

LiquidJS has two supported layers. Everything else exported from the package root is unstable: it stays available, but it can change without a major version.

## Caller API

Use these from application code:

- Construct a {@link Liquid} and call `parse`, `render`, `parseAndRender`, `parseFile`, `renderFile`, `renderToStream`, `renderFileToStream`, or `evalValue`.
- Pass {@link LiquidOptions} to the constructor. Per-render overrides are {@link RenderOptions} and {@link RenderFileOptions}.
- Inspect templates with `analyze()` or `parseAndAnalyze()`. Both return a {@link StaticAnalysis}. That object is the analysis contract. `variables`, `fullVariables`, `variableSegments`, `globalVariables`, `globalFullVariables`, and `globalVariableSegments` only project `variables` and `globals` from it. `globals` on an analysis means names the template did not assign. `globals` on options means the fallback scope. They are not the same value.
- Register extensions with `registerTag`, `registerFilter`, `unregisterTag`, `unregisterFilter`, and `plugin`.
- Adapt Express with `express()`. See [Use in Express](./use-in-expressjs.md).

`render`, `parseAndRender`, and `renderFile` return a string. `evalValue` returns the expression's value. A top-level `break` or `continue` does not escape as a symbol from those string methods.

Rendering again with the same {@link Context} is not a retry. `assign`, `increment`, and `decrement` mutate that scope, so a second render is a different run.

Invalid constructor options throw {@link LiquidOptionError}. The message text is the contract; `name` is `LiquidOptionError` and `code` is `OPTION_ERROR`. A missing template throws {@link LiquidLookupError} with `code` still set to `ENOENT`. Limit failures throw {@link LiquidLimitError} (`LIMIT_EXCEEDED`) unless render wraps them as {@link RenderError}. Template failures use {@link TokenizationError}, {@link ParseError}, {@link RenderError}, {@link UndefinedVariableError}, or {@link LiquidErrors}. Those classes, plus the option, limit, and lookup errors, are {@link LiquidFailure}. Narrow with {@link isLiquidFailure}.

`AssertionError` is not a template or option failure. Do not catch it to handle user input.

Each engine gets its own `globals` and `operators` when you omit them. Mutating `defaultOptions.globals` or `defaultOptions.operators` does not affect engines created afterwards.

## Extension protocol

Tags, filters, drops, and filesystem adapters use this layer:

- Subclass {@link Tag}. The engine calls the constructor with the tag token, remaining tokens, the {@link Liquid} instance, and the current parser. The parser is the fourth argument. {@link Tag} does not store it, and `Liquid.parser` is deprecated.
- `render` may return a value, a Promise, or a generator. The same three shapes apply to filters and to {@link FS} methods (`readFile`, `exists`, `contains`). Yield or await {@link Emitter.write}. See [Sync and Async](./sync-and-async.md).
- Generator methods on `Liquid` (`_render`, `_parseAndRender`, `_parseFile`, `_parsePartialFile`, `_parseLayoutFile`, `_renderFile`, `_evalValue`) are that protocol. The underscore is not privacy.
- Tag implementations use {@link Value}, {@link Hash}, {@link Context}, {@link TagToken}, and {@link TopLevelToken}.
- Drops subclass {@link Drop}. A custom filesystem implements {@link FS}.

Re-register a built-in filter from the exported `filters` object. That object is a snapshot of the built-in handlers, not a live view of an engine.

## Unstable exports

Tokenizer, token classes other than the tag and top-level types above, `evalToken`, `assert`, `toPromise`, `createTrie`, `TypeGuards`, `pendingLoads`, and `renderer` are not a supported API. Importing them from the package root still works. Do not depend on their shape.
