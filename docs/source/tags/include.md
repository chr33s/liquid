---
title: include
---

**Since:** v1.9.1

> **Deprecated**
>
> This tag is deprecated, use <a href="./render.md">render</a> tag instead, which contains all the features of `include` and provides better encapsulation.

## Include a Template

Renders a partial template from the template [roots][root].

```liquid
{% include 'footer.liquid' %}
```

If [extname][extname] option is set, the above `.liquid` extension becomes optional:

```liquid
{% include 'footer' %}
```

When a partial template is rendered by `include`, the code inside it can access its parent's variables but its parent cannot access variables defined inside an included template.

## Passing Variables

Variables defined in the parent's scope can be passed to the partial template by listing them as parameters on the `include` tag:

```liquid
{% assign my_variable = 'apples' %}
{% include 'name', my_variable: my_variable, my_other_variable: 'oranges' %}
```

Parameters are evaluated in order, and a later one sees the earlier ones: in `{% include 'name' a: 1, b: a %}`, `b` is `1`. The parameters of [render](./render.md) stay independent of each other.

## The `with` Parameter

A single object can be passed to a snippet by using the `with...as` syntax:

```liquid
{% assign featured_product = all_products['product_handle'] %}
{% include 'product' with featured_product as product %}
```

In the example above, the `product` variable in the partial template will hold the value of `featured_product` in the parent template.

Without `with` or `for`, `include` binds the variable named like the template. If that variable is an array, the partial renders once per element:

```liquid
// item.liquid
[{{ item }}]

// with item = [1, 2, 3]
{% include 'item' %}

// result
[1][2][3]
```

A name that evaluates to something other than a string raises `Argument error in tag 'include' - Illegal template name`.

`include` is not allowed inside a partial rendered by [render](./render.md): it raises `include usage is not allowed in this context`.

## Outputs & Filters

When filename is specified as literal string, it supports Liquid output and filter syntax. Useful when concatenating strings for a complex filename.

```liquid
{% include "prefix/{{name | append: '.html'}}" %}
```

> **Quotes**
>
> String literals have no escape sequences, so a `\"` cannot appear inside a `"`-quoted name. Quote the inner string with the other kind of quote, as above.
