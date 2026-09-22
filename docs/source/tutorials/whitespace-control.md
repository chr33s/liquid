---
title: Whitespace Control
---

To keep source code neat and indented, we're adding spaces to our templates. LiquidJS offers whitespace control capabilities to eliminate these unwanted whitespaces in output HTML.

## via Markups

By default, all tags and output markups lines will generate a NL (`\n`), and whitespaces if there's any indentation. For example:

```liquid
{% assign author = "harttle" %}
{{ author }}
```

Outputs (note the blank line):

```

harttle
```

You can include hyphens in tag syntax (`{{-`, `-}}`, `{%-`, `-%}`) to strip whitespace from the left or right. For example:

```liquid
{% assign author = "harttle" -%}
{{ author }}
```

Outputs:

```
harttle
```

In this case, the `-%}` strips the whitespace from the right side of the `assign` tag.

## Blank blocks

As in the reference engine, an `if`, `unless`, `case` or `for` block whose body holds only whitespace, `assign`, `capture` and comments writes none of that whitespace:

```liquid
[{% if true %}
  {% assign x = 1 %}
{% endif %}]
```

Outputs:

```
[]
```

## via Options

Alternatively, LiquidJS provides these per engine options to enable whitespace control without sweeping changes of your templates:

* `trimTagLeft`
* `trimTagRight`
* `trimOutputLeft`
* `trimOutputRight`

[LiquidJS][liquidjs] will **NOT** trim any whitespace by default, aka. above options all default to `false`. For details of these options, see the {@link LiquidOptions | options}.

## Greedy Mode

In greedy mode (enabled by the {@link LiquidOptions.greedy | greedy option}), all consecutive whitespace chars (including `\n`) will be trimmed. Greedy mode is enabled by default to be compliant with [shopify/liquid][shopify/liquid].

## Bug-Compatible Trimming

Shopify's storefront renders themes with the reference's `bug_compatible_whitespace_trimming` parse option: when a `{%-` or `{{-` trims away all of the text before it, the first character of that text is kept. The {@link LiquidOptions.bugCompatibleWhitespaceTrimming | bugCompatibleWhitespaceTrimming option} does the same; it defaults to `false`.

```liquid
{{ 'a' }}

{%- if true %}b{% endif %}
```

Output `ab` by default, and `a` then a newline then `b` with the option set.

[shopify/liquid]: https://github.com/Shopify/liquid
[liquidjs]: https://github.com/harttle/liquidjs
