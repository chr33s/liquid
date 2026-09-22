---
title: Migrate to v12
---

v12 aligns the engine with the pinned Ruby reference (Shopify/liquid 5.14.0) and the documented Shopify theme dialect. Every removal below has a replacement or an explicit note that none exists.

## Removed filters

These 27 names were neither in the Ruby reference nor in the reviewed hosted catalog:

| Removed | Replacement |
| --- | --- |
| `array_to_sentence_string` | none; build the sentence with `join` and `last` |
| `cgi_escape`, `uri_escape` | `url_encode`, or `url_escape`/`url_param_escape` in the theme profile |
| `date_to_string`, `date_to_long_string`, `date_to_rfc822`, `date_to_xmlschema` | `date` with an explicit format |
| `find_exp`, `find_index_exp`, `has_exp`, `reject_exp`, `where_exp`, `group_by_exp` | none; the reference grammar has no expression predicates |
| `group_by` | none; group in host code before rendering |
| `inspect` | `json` in the theme profile |
| `jsonify` | `json` in the theme profile |
| `normalize_whitespace` | `squish` |
| `number_of_words` | none; count in host code |
| `pop`, `push`, `shift`, `unshift` | none; `concat` and `slice` cover the reference cases |
| `raw` | register your own filter with `{ raw: true }` and pipe through it last |
| `sample` | none; a template is not the place for randomness |
| `slugify` | `handleize` in the theme profile — **not** an equivalent; it folds accents and collapses to hyphens differently |
| `to_integer` | none; arithmetic filters convert their own input |

An unknown filter is still ignored under the default permissive policy and raised under `strictFilters`.

## Removed tags

`{% block %}` / `{% endblock %}` inheritance is gone. Layouts now receive the page body as `content_for_layout`:

```liquid
// before
// layout.liquid
Header{% block %}{% endblock %}Footer
// page.liquid
{% layout "layout" %}{% block %}Body{% endblock %}

// after
// layout.liquid
Header{{ content_for_layout }}Footer
// page.liquid
{% layout "layout" %}Body
```

Layout resolution, the `layouts` option and `{% layout none %}` are unchanged, but the `layout` tag itself now belongs to the theme profile; see <a href="#moved-to-the-theme-profile">Moved to the theme profile</a>. Shopify's own `block` object and `{% content_for "block" %}` are a different concept and are available in the theme profile.

## Removed options

| Removed | Replacement |
| --- | --- |
| `jekyllInclude` | none; use the reference `{% include %}` syntax |
| `jekyllWhere` | none; `where` matches by `==` |
| `jsTruthy` | none; only reference truthiness is implemented |
| `dynamicPartials` | none; quoted names are literal, unquoted names are expressions |

## Changed behaviour

**`{% render %}`** takes a quoted literal template name. A variable name is rejected, and a quoted name containing `{{ }}` is a literal filename. Without an alias, `with`/`for` bind under the snippet's basename (`{% render "cards/item" with product %}` binds `item`), and each `for` iteration gets a fresh context.

**`{% include %}`** now accepts `for` and `as`, binds under the basename, and is disabled inside `{% render %}`: it raises `include usage is not allowed in this context` through the render error policy instead of writing that text. Its parameters are evaluated in order, so a later one sees the earlier ones (`{% include 't' a: 1, b: a %}` binds `b` to `1`); `render` parameters stay independent. Without `with`/`for`, it binds the variable named like the template, so `{% include 'item' %}` renders once per element when `item` is an array.

**Property filters take literal keys.** `map: "a.b"` reads the key `"a.b"`, not `a` then `b`. Restructure the data, or map in host code.

**`divided_by`** divides integers as integers: `{{ 5 | divided_by: 2 }}` is `2`. Use a decimal on either side for a decimal result. Its third argument is gone. Integer division by zero raises; once either side is a decimal the result is `Infinity` or `NaN`, as the reference engine gives. `modulo` raises for a zero divisor whatever the operands are. A number that only exists at runtime carries no decimal-ness, so this distinction follows what the template wrote.

**Decimals keep their kind.** A decimal literal or decimal string stays a decimal through `assign` and arithmetic, and renders with its fraction: `{{ 7.0 }}` is `7.0`, `{{ 3.5 | times: 2 }}` is `7.0`, `{% assign n = 7.0 %}{{ n | divided_by: 2 }}` is `3.5`. `{{ 7 | divided_by: 2 }}` is still `3`. A JavaScript number passed in scope carries no kind, so `7.0` from the host is the integer `7`; pass `new FloatDrop(7)` ({@link FloatDrop} is exported from the package root) to keep it a decimal.

**`templateLimit` is the reference render score.** Each block body charges its node count up front, and each item a `for`/`tablerow` loop visits over a range adds one; array items add nothing. `{% for i in (1..3) %}{{ i }}{% endfor %}` scores 7. Limits tuned against the old node count may need raising.

**`assignLimit` is a monotonic assign score.** A string scores its UTF-8 bytes, an array or hash one plus its contents (hash keys included), anything else one. Re-assigning charges again; nothing is refunded. Exceeded budgets read `Memory limits exceeded: template limit exceeded` (or `assign`, `output length`). See [Security Model](./security-model.md) for both, and for {@link ResourceLedger}, which shares budgets across renders.

**Built-in filters check their argument count.** `{{ "a" | append }}` and `{{ "a" | append: "b", "c" }}` now fail. User-registered filters are never checked.

**Undefined filters are reported at render time**, not parse time, so one parsed template can be rendered against different registries.

**`concat`** requires an array argument; `concat: nil` fails.

**`escape`** writes `&quot;` for `"`. `truncatewords` does not add an ellipsis at an exact word count and returns the input untouched when nothing is cut. `split: " "` splits on runs of ASCII whitespace. `size`, `slice` and `truncate` count characters, not code units.

**Breaking: string literals have no escape sequences.** `"a\nb"` is `a`, a backslash, `n`, `b`, and `\"` does not escape a quote: the literal ends there. Quote with the other kind instead, as in `'say "hi"'` or `"it's"`. Templates that relied on `\"`, `\n` or `\u` escapes must be rewritten.

**Numbers print and compute like Ruby.** Floats print as Ruby's `Float#to_s`: `1.0e+15`, `1.0e-05`. Decimal arithmetic in `plus`, `minus`, `times`, `divided_by`, `modulo` and `sum` is exact on the decimal spelling, so `{{ 0.1 | plus: 0.2 }}` is `0.3`. An integer literal past 2^53 is kept exact, and so is integer arithmetic on it. Math filters read any input that is not a number or a string as `0` (`{{ true | plus: 1 }}` is `1`), and a string reads `1_000` as `1000`. Integer arguments to `truncate`, `truncatewords` and `slice`, and `for` loop `offset`/`limit`, follow Ruby's `Integer()`: a decimal like `2.9` raises `invalid integer`, as does `nil` for the filters (a `nil` loop argument is `0`). `tablerow` reads `cols`, `offset` and `limit` loosely, so `'x'` is `0`.

**Filters read arrays and hashes as Ruby's `inspect`.** `{{ array | strip }}` is `["a", "b"]` and a hash reads `{"a"=>1}`; `{{ array }}` alone still renders the items one after another. A range renders `1..5`. `{{ }}` renders nothing in every error mode.

**Lookups follow the reference.** `a.first`, `a.last` and `a.size` are commands, while `a["first"]` only reads a key. A string answers `first`, `last` and `size` but no index, and an integer answers `size` with `8`. A hash's `.first` is its first `[key, value]` pair unless it has a key `first`. `blank.foo` reads a variable named `blank`, `a . b` may be spaced, and a range is never used as a key.

**Comparisons.** `<`, `>`, `<=` and `>=` are false when either side is `nil` or a boolean, and a number against a string raises `comparison of Integer with String failed` (or `comparison of String with 1 failed`). `contains` is false for a `nil` or `false` needle, and a hash contains its string keys. See [Operators](./operators.md).

**Control flow.** `case` renders every matching `when`, and every matching value of one `when`, and every `else` reached before a match. `if` and `unless` render only the first `else`; a later `elsif` or `else` is ignored, as is text after `else`. Duplicated `else` and `elsif` after `else` no longer raise. An `if`, `unless`, `case` or `for` whose bodies hold only whitespace, `assign`, `capture` and comments writes no whitespace; see [Whitespace Control](./whitespace-control.md).

**Filter changes.** `sort` raises `cannot sort values of incompatible types` for a mix like numbers and strings, and `sort_natural` compares items as text. `size` is `8` for an integer and `0` for a decimal. `first` on a hash returns its first pair. `escape` and `url_encode` keep `nil`, and `truncate` and `truncatewords` return `nil` for `nil` input. `strip_html` removes `<script>`, `<!-- -->` and `<style>` blocks, then any tag. `base64_url_safe_encode` keeps the `=` padding. `replace` and `replace_first` read Ruby's backslash escapes in the replacement (`\0`, `\&`, `` \` ``, `\'`, `\\`). `truncatewords` splits on ASCII whitespace only. `date` accepts `now`/`today` in any case, uses fixed formats for `%c`, `%x` and `%X`, and supports `%D`, `%F`, `%R`, `%T`, `%r`, `%v`, `%V`, `%G` and `%g`. A date string with its own offset keeps it unless `timezoneOffset` is set; see `preserveTimezones` in [Options](./options.md). Argument count errors count the input, as the reference does: `wrong number of arguments (given 2, expected 1)`.

**Tag changes.** An unnamed `cycle` whose values include a variable keeps its own counter, and `cycle` renders its values as text (`false`). `tablerow` renders nothing for a `nil` or `false` collection. A string collection is one item whatever the `offset` and `limit`, in `for` and `tablerow`. `for` `offset`/`limit` select as the reference does: a negative `offset` starts at the first item but counts toward the `limit`. `{% render 'x' for value %}` over something that is not iterable renders once, without `forloop`, and a `nil` `with`/`for` value is not bound. `include` with a name that is not a string raises `Argument error in tag 'include' - Illegal template name`. A `comment` block nests inside another, a `doc` body is read verbatim, and `{%- endraw -%}` closes a `raw` block.

**Error messages match the reference.** In every error mode: `Unknown tag 'x'`, `'if' tag was never closed`, `'endfor' is not a valid delimiter for if tags. use endif`, `Unexpected outer 'else' tag`, `Tag '{% if x' was not properly terminated with regexp: /\%\}/`, `Variable '{{ x' was not properly terminated with regexp: /\}\}/`, `Syntax Error in 'raw' - Valid syntax: raw`, the `doc` argument and nesting errors, and `Syntax error in tag '#' - Each line of comments must be prefixed by the '#' character`. Code matching the old `tag "x" not found` or `tag ... not closed` text must be updated. Under `renderErrors: "inline"`, a partial that fails to tokenize is written as `Liquid syntax error (file line N): message`, and outside `errorMode: "strict2"` an error in a tag that renders nothing, like an `if` around only `assign`s, is reported to `onError` but writes no text.

**`errorMode: "strict2"` is the full reference grammar**, and `"strict"` uses the reference strict parser for outputs, `echo`, `if`/`elsif`/`unless`, `for` and the value of `assign`; see Error Mode in [Options](./options.md). Templates that passed the old strict check may now fail.

**`maxDepth` defaults to `100`** and counts scopes: the template itself, each `include`/`render`/`layout`, and each `for`/`tablerow` loop. Exceeding it raises `Nesting too deep`, which `renderErrors: "inline"` writes in place instead of stopping. See [Security Model](./security-model.md).

**`{% tablerow %}`** emits the reference markup, newlines included: `<tr class="row1">\n…</tr>\n`.

**`date`** returns its input for an empty or `nil` format. With `dateFormat: ''` a missing format is an error.
- **Lax mode reads like the reference's lax parser.** In the default `errorMode: "lax"`, markup that cannot be read as written is no longer an error: it is read the way Shopify/liquid's lax parser reads it, skipping what it does not recognize (`{{ 'X' | downcase) }}` renders `x`, `{% for i in (1...5) %}` loops over `1..5`). Such a condition is evaluated left to right, and an unknown operator like `{% if a foo b %}` is an `Unknown operator foo` error when reached. An output now ends at the first `}}` even inside quotes. Use `errorMode: "strict"` or `"strict2"` to reject such markup, or `"warn"` to keep the previous tolerant tokenizer with its errors.
- **`not` is not an operator.** It was removed with the other dialect extensions; in lax mode `not x` reads as the reference reads it.
- **Nil is nil.** A `nil` from the data equals a variable that is not defined: `{% if z == missing %}` holds when `z` is `nil`.
- **A filter argument that reads nothing is `nil`**, not an omitted argument taking its default: `{{ "abc" | truncate: missing }}` is an `invalid integer` error.
- **`where`, `reject` and `find` with a `nil` target select by truthiness**, as an omitted target does; over a boolean, `nil` or float item they return `nil`.
- **A range equals only a range with the same bounds**, never an array: `(1..3) == list` is false.
- **An array answers only an integer index and `size`, `first` and `last`**: `list["0"]` reads nothing. `length` stays as an extension.
- **Core filters take keyword arguments as one trailing hash**, as the reference passes them, so `{{ x | append: key: 1 }}` appends `{"key"=>1}`. Filters you register still receive `[key, value]` pairs.
- **`include` and `render` with a literal `false` or `nil` binding bind nothing**, and a bare key such as `with,` binds nothing either.
- **`date` reads only an integer as a timestamp**: a float, or a string like `"1.5"`, is returned as given.
- **Syntax errors use the reference's messages and lines**: a malformed or unclosed tag fails when the parse reaches it; `Unknown tag '{% => x %}'`; `Syntax Error in 'for loop' …`; in strict modes a markup error quotes its markup (`… in "x = a and"`) and a branch error is reported at its block's line; an unclosed block is reported where the input ends.

## Moved to the theme profile

The core profile registers exactly the pinned Ruby reference inventory. The `layout` tag and the `json`, `sha256` and `hmac_sha256` filters are registered by `profile: 'shopify_theme'` only. On a core engine, `{% layout %}` is an unknown tag, and the filters are unknown filters. To keep one of them without the rest of the dialect, register it:

```javascript
import { Liquid, LayoutTag, hostedFilters } from '@chr33s/liquid'

const liquid = new Liquid()
liquid.registerTag('layout', LayoutTag)
liquid.registerFilter('json', hostedFilters.json)
liquid.registerFilter('sha256', hostedFilters.sha256)
liquid.registerFilter('hmac_sha256', hostedFilters.hmac_sha256)
```

`json` is now the hosted projection: `nil` is `null`, product and variant inventory fields are left out, and there is no `space` argument, so `json: 4` no longer pretty-prints. `outputEscape: 'json'` is unaffected.

## New in this release

- Tags `{% doc %}`, `{% ifchanged %}`, and `self` for dynamic lookups.
- Filters `h`, `base64_url_safe_encode`, `base64_url_safe_decode`.
- {@link FloatDrop}, to pass a whole-valued decimal from JavaScript.
- `<>` as an inequality alias; `and`/`or` short circuit.
- `errorMode: "lax" | "warn" | "strict" | "strict2"` for trailing markup and operators missing an operand; `"strict"` and `"strict2"` parse markup with the reference parsers, and `"strict2"` also rejects bare bracket lookups like `{{ ['key'] }}`.
- `renderErrors: "raise" | "inline"` and a per-render `onError`, to write `Liquid error (line N): message` in place of a failing node and continue. See [Options](./options.md).
- `assignLimit`, `maxParseDepth` and a shared `ResourceLedger` for resource control.
- `strictFilters`, `filters` and `theme` as per-render options.
- The [Shopify theme profile](./shopify-theme-profile.md), with `{% render block %}` app blocks through the `appBlock` provider and schema defaults for section settings.
- {@link LiquidOptions.bugCompatibleWhitespaceTrimming | bugCompatibleWhitespaceTrimming}, to trim whitespace as Shopify's storefront does.
