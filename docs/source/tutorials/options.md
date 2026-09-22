---
title: Options
---

The {@link Liquid | Liquid} constructor accepts a plain object as options to define the behavior of LiquidJS. All of these options are optional thus we can specify any of them, for example the `cache` option:

```javascript
import { Liquid } from '@chr33s/liquid'
const engine = new Liquid({
    cache: true
})
```

> **API documentation**
>
> Following is an overview for all the options. For exact types and signatures, see {@link LiquidOptions}.

## cache

**cache** is used to improve performance by caching previously parsed template structures, especially in cases when we repeatedly parse or render files.

It defaults to `false`. When set to `true`, a default LRU cache of size 1024 will be enabled. It can also be a number indicating the cache size you want.

Additionally, it can also be a custom cache implementation. See [Caching](./caching.md) for details.

## Partials/Layouts

**root** is used to specify template directories for LiquidJS to look up and read template files. Can be a single string or an array of strings. See [Render Files](./render-file.md) for details.

**layouts** is used to specify template directories for LiquidJS to look up files for `{% layout %}`. Same format as `root` and will default to `root` if not specified.

**partials** is used to specify template directories for LiquidJS to look up files for `{% render %}` and `{% include %}`. Same format as `root` and will default to `root` if not specified.

**relativeReference** is set to `true` by default to allow relative filenames. Note that relatively referenced files also need to be within the corresponding root. For example you can reference another file like `{% render ../foo/bar %}` as long as `../foo/bar` is also within `partials` directory.

## extname

**extname** defines the default extension name to be appended into filenames if the filename has no extension name. Defaults to `''` which means it's disabled by default. By setting it to `.liquid`:

```liquid
{% render "foo" %}  there's no extname, adds `.liquid` and loads foo.liquid
{% render "foo.html" %}  there is an extname already, loads foo.html directly
```

> **Legacy Versions**
>
> Before 2.0.1, <code>extname</code> is set to `.liquid` by default. To change that you need to set <code>extname: ''</code> explicitly. See <a href="https://github.com/harttle/liquidjs/issues/41" target="_blank">#41</a> for details.

## fs

**fs** is used to define a custom file system implementation which will be used by LiquidJS to look up and read template files. See [Abstract File System](./render-file.md) for details.

## globals

**globals** is used to define global variables available to all templates even in cases of [render tag](../tags/render.md). See [3185][185] for details.

## outputEscape

{@link LiquidOptions.outputEscape | outputEscape} can be used to automatically escape output strings. It can be one of `"escape"`, `"json"`, or `(val: unknown) => string`, defaults to `undefined`.

- For untrusted output variables, set `outputEscape: "escape"` makes them be HTML escaped by default. To opt a value out, register a filter with `{ raw: true }` and pipe through it last.
- `"json"` is useful when you're using LiquidJS to create valid JSON files.
- It can even be a function that allows you to control what variables are output throughout LiquidJS. Please note the input can be any type other than string, e.g. a filter may return a non-string value.

## Date

**timezoneOffset** is used to specify a different timezone to output dates, your local timezone will be used if not specified. For example, set `timezoneOffset: 0` to output all dates in UTC/GMT 00:00.

**preserveTimezones** is a boolean that affects only date strings. When `true`, a string with its own offset, like `2020-06-15 14:30:00 -0400`, keeps that offset when output, as in the reference engine. Date objects passed to LiquidJS as data are not affected. When it is not set, a date string keeps its offset unless `timezoneOffset` is set; set it to `true` to keep the offset even then, or to `false` to always convert to `timezoneOffset` or the local timezone.

**dateFormat** is used to specify a default format to output dates. `%A, %B %-e, %Y at %-l:%M %P %z` will be used if not specified. For example, set `dateFormat: %Y-%m-%dT%H:%M:%S:%LZ` to output all dates in [JavaScript Date.toJson()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toJSON) format.

## Trimming

**greedy**, **trimOutputLeft**, **trimOutputRight**, **trimTagLeft**, **trimTagRight** options are used to eliminate extra newlines and indents in templates around Liquid Constructs. See [Whitespace Control](./whitespace-control.md) for details.

## Delimiter

**outputDelimiterLeft**, **outputDelimiterRight**, **tagDelimiterLeft**, **tagDelimiterRight** are used to customize the delimiters for LiquidJS [Tags and Filters](./intro-to-liquid.md). For example with `outputDelimiterLeft: <%=, outputDelimiterRight: %>` we are able to avoid conflicts with other languages:

```ejs
<%= username | append: ", welcome to LiquidJS!" %>
```

## Strict

**strictFilters** is used to assert filter existence. If set to `false`, undefined filters will be skipped. Otherwise, undefined filters will cause a parse exception. Defaults to `false`.

**strictVariables** is used to assert variable existence.  If set to `false`, undefined variables will be rendered as empty string.  Otherwise, undefined variables will cause a render exception. Defaults to `false`.

**lenientIf** modifies the behavior of `strictVariables` to allow handling optional variables. If set to `true`, an undefined variable will *not* cause an exception in the following two situations: a) it is the condition to an `if`, `elsif`, or `unless` tag; b) it occurs right before a `default` filter. Irrelevant if `strictVariables` is not set. Defaults to `false`.

**ownPropertyOnly** limits template property reads on plain scope objects to own properties. Defaults to `true`. See [Security Model](./security-model.md).

> **Nonexistent Tags**
>
> Nonexistent tags always throw errors during parsing and this behavior cannot be customized.

## Error Mode

**errorMode** decides what happens to markup the grammar does not accept, such as text left over after a complete expression or an operator missing an operand (`{% if true and %}`). Defaults to `"lax"`.

- `"lax"` reads markup it cannot read as written the way the reference's lax parser does, skipping what it does not recognize: `{{ 'X' | downcase) }}` renders `x`, `{% case foo=>bar %}` reads `foo.bar`, `{% for i in (1...5) %}` loops over `1..5`, and tag attributes are found anywhere in the markup. Such a condition is read as comparisons evaluated left to right, so `{% if true && false %}` holds, and an operator the reference does not know, as in `{% if a foo b %}`, is an `Unknown operator foo` error when it is reached. Markup that reads as written keeps its meaning. An output ends at the first `}}`, quoted or not.
- `"warn"` records leftover markup in `liquid.warnings`, and reads outputs across quoted `}}`.
- `"strict"` throws at parse time. Outputs, `echo`, `if`/`elsif`/`unless` and `for` are parsed by the reference strict parser and fail with its messages, such as `Unexpected character ~` or `[:end_of_string] is not a valid expression`. Bare bracket lookups like `{{ ['key'] }}` are allowed, and a filter argument list may not end with a comma. The other tags, such as `assign`, `case`, `cycle`, `include`, `render` and `tablerow`, keep the lax reading, as the reference's strict mode does.
- `"strict2"` parses every output and tag markup with the reference `strict2` grammar and rejects it with the reference messages, for example `Expected id but found end_of_string` for `{{ a | }}`, `[:comma, ","] is not a valid expression`, `For loops require an 'in' clause`, `Invalid attribute 'step' in tablerow loop. Valid attributes are cols, limit, offset, and range`, and `Expected string but found id` for a `render` name that is not quoted. A trailing comma is accepted after filter arguments and in `render`, `include`, `cycle` and `for`. Bare bracket lookups fail with `Bare bracket access is not allowed. Use self['...'] instead`.

`{{ }}` renders nothing in every mode. Structural errors read the same in every mode: `Unknown tag 'x'`, `'if' tag was never closed`, `'endfor' is not a valid delimiter for if tags. use endif`, `Unexpected outer 'else' tag`, and `Tag '{% if x' was not properly terminated with regexp: /\%\}/` (or `Variable '{{ x' was not properly terminated with regexp: /\}\}/`) for a tag or output that is never closed.

## Render Errors

**renderErrors** decides what a render error does. `"raise"` stops rendering and rejects with the error. `"inline"` writes `Liquid error (line N): message` in place of the failing node, or `Liquid error (file line N): message` inside a partial, and carries on. Defaults to `"raise"`; it can also be passed per call in {@link RenderOptions.renderErrors | RenderOptions}.

```javascript
const errors = []
await liquid.parseAndRender('a{{ 1 | divided_by: 0 }}b', {}, {
  renderErrors: 'inline',
  onError: err => errors.push(err)
})
// "aLiquid error (line 1): divided by 0b"
```

{@link RenderOptions.onError | onError} receives each error the inline policy recovered from. Under `strictVariables`, an undefined variable is reported to `onError` but writes nothing. Neither does an error in an `assign` or, outside `errorMode: "strict2"`, in a tag that renders nothing, such as an `if` around only `assign`s; the assignment is abandoned. A partial that fails to tokenize, like one with an unclosed tag, is written as `Liquid syntax error (file line N): message`. Exceeding a resource limit stops rendering under both policies; with `"inline"` the result is just the error line. `Nesting too deep` from {@link LiquidOptions.maxDepth | maxDepth} is not a resource limit: the inline policy writes it in place and carries on. **catchAllErrors** still collects the render errors of a `"raise"` render into one `LiquidErrors`.

## Parameter Order

Parameter orders are ignored by default, for example `{% for i in (1..8) reversed limit:3 %}` will always perform `limit` before `reversed`, even if `reversed` occurs before `limit`. To make parameter order respected, set **orderedFilterParameters** to `true`. Its default value is `false`.

[185]: https://github.com/harttle/liquidjs/issues/185
