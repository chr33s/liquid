---
title: Security Model
---

LiquidJS provides DoS-oriented limits (`parseLimit`, `templateLimit`, `assignLimit`, `outputLengthLimit`, `maxDepth`) to reduce risk. This page summarizes those limits, {@link LiquidOptions.ownPropertyOnly | `ownPropertyOnly`}, custom {@link Drop | `Drop`} usage, and the security boundary to assume in production.

## At a glance

LiquidJS ships a thin cooperative DoS layer:

- {@link LiquidOptions.parseLimit | parseLimit}: limit total template size per `parse()` call.
- {@link LiquidOptions.templateLimit | templateLimit}: limit the render score (nodes rendered plus range items visited) per `render()` call.
- {@link LiquidOptions.assignLimit | assignLimit}: limit the assign score of `{% assign %}` and `{% capture %}` per `render()` call.
- {@link LiquidOptions.outputLengthLimit | outputLengthLimit}: limit total output length per `render()` call.
- {@link LiquidOptions.maxDepth | maxDepth}: limit the render-time nesting of scopes: the template, `{% render %}`, `{% include %}`, `{% layout %}`, `{% for %}` and `{% tablerow %}`.
- Strftime numeric pad widths in the `date` filter are capped at `1_000_000` (1M) per conversion.
- Range bounds outside JavaScript's safe integer range, including infinities, are rejected.

These are cooperative safeguards, not runtime isolation—see <a href="#production-guidance">Production guidance</a> below for host-level limits and online-service hardening.

## Limit details

### parseLimit

{@link LiquidOptions.parseLimit | parseLimit} restricts the size (character length) of templates parsed in each `.parse()` call, including referenced partials and layouts. Since LiquidJS parses template strings in near O(n) time, limiting total template length is usually sufficient.

A typical PC handles `1e8` (100M) characters without issues.

### templateLimit

Restricting template size alone is insufficient because dynamic loops with large counts can occur during rendering. {@link LiquidOptions.templateLimit | templateLimit} mitigates this by limiting the render score of each `render()` call, the same score the reference engine keeps.

```liquid
{%- for i in (1..10000000) -%}
    order: {{i}}
{%- endfor -%}
```

Each block body charges its node count before it renders (the `for` tag, literal `order: `, output `{{i}}`, and so on), and each item a `for` or `tablerow` loop visits over a range adds one. Items of an array add nothing of their own, and items skipped by `offset`/`limit` or left after a `break` are not charged. `{% for i in (1..3) %}{{ i }}{% endfor %}` scores 7. In the above example, a limit of `30000000` would be exceeded before the loop finishes.

`templateLimit` is checked before each body renders, so compute-intensive filters/tags/user-defined functions between checks can still cause DoS.

### assignLimit

{@link LiquidOptions.assignLimit | assignLimit} caps the assign score of a `render()` call. Every `{% assign %}` and `{% capture %}` adds the score of the value it binds: a string scores its UTF-8 byte length, an array or hash one plus the score of its contents (hash keys included), and any other value one. The score only grows: re-assigning a variable charges again and nothing is refunded.

An exceeded template or assign budget raises `Memory limits exceeded: template limit exceeded` (or `assign limit exceeded`), as does an exceeded `outputLengthLimit` (`output length limit exceeded`).

### Budgets across renders

`templateLimit` and `assignLimit` start from zero on each render. To bound the work of several renders together, hand each of them the same {@link ResourceLedger}:

```javascript
import { Liquid, ResourceLedger } from '@chr33s/liquid'

const ledger = new ResourceLedger({ templateLimit: 100000, assignLimit: 1000000 })
await liquid.parseAndRender(page, scope, { ledger })
await liquid.parseAndRender(section, scope, { ledger }) // charged to the same budgets
```

### outputLengthLimit

{@link LiquidOptions.outputLengthLimit | outputLengthLimit} caps the cumulative length of output written during a `render()` call, including output from partials rendered via `{% render %}`.

### maxDepth

{@link LiquidOptions.maxDepth | maxDepth} limits how deeply scopes nest at render time. Defaults to `100`, as in the reference engine. The template itself counts as one, and each `{% render %}`, `{% include %}`, `{% layout %}` and each `{% for %}` or `{% tablerow %}` loop adds one while it renders, so with `maxDepth: 2` a loop nested in a loop fails. Exceeding it raises `Nesting too deep`, an ordinary render error: under `renderErrors: "inline"` it is written in place and rendering continues. Execution uses the shared generator evaluator; `maxDepth` limits nested template work independently of the JavaScript call stack.

The `memoryLimit` option was removed in v11; enforce memory limits at the host or process level instead.

## `ownPropertyOnly` and scope data

With {@link LiquidOptions.ownPropertyOnly | `ownPropertyOnly`} `true` (default), plain scope objects only expose **own** properties (no inherited / `Object.prototype` keys), and reads of `__proto__`, `constructor`, and `prototype` are blocked (own and inherited) as a prototype-pollution defense. With `false`, inherited properties and those keys are allowed—sanitize untrusted scope data (e.g. with [bourne](https://www.npmjs.com/package/bourne)) before passing it as scope. LiquidJS also uses null-prototype objects for managed scope frames (e.g. `{% capture %}`, `{% assign %}`) so internal frames do not inherit from `Object.prototype`.

Not restricted: {@link Drop | `Drop`} values, iteration via `Symbol.iterator`, `.size`/`.first`/`.last`, filters, and custom tags.

Use `true` for untrusted objects; add {@link LiquidOptions.strictVariables | `strictVariables`} if missing paths should error. Override per render via {@link RenderOptions.ownPropertyOnly | `RenderOptions`}. This is a read policy for scope data—not a sandbox for filters, tags, or your code.

## Custom `Drop` classes

{@link Drop | `Drop`} values are not restricted the same way: LiquidJS still reads the prototype chain and may call {@link Drop.liquidMethodMissing | `liquidMethodMissing`}. **You** control what a drop exposes; narrow APIs and never feed unsafe data into drops unless the class is built for template access. `ownPropertyOnly` alone does not harden custom drops—audit them like any privileged code.

## Production guidance

LiquidJS does not sandbox template code—custom filters, tags, and scope helpers run as ordinary JavaScript with your process privileges. Built-in DoS limits are one layer; production deployments, especially online services that accept template input, need additional hardening:

- **Prefer curated templates** over fully user-defined Liquid when possible; if users need customization, offer a restricted subset rather than open template editing.
- Run each render in a **worker thread or child process** with a wall-clock timeout; **kill** the worker on expiry. Libraries such as [paralleljs][paralleljs] can help for heavy single-template work.
- Enforce **container/Kubernetes cgroup limits**, `ulimit`, or equivalent on the renderer process for memory and CPU.
- Apply **request rate limits** at the API or gateway layer.
- **`node:vm`, `isolated-vm`, and Jinja/Twig-style sandbox modes are not a security boundary**—template logic runs in the same JS runtime as your app, with your privileges.

[paralleljs]: https://www.npmjs.com/package/paralleljs
