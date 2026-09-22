---
title: layout
---

**Since:** v1.9.1

> **Theme profile only**
>
> `layout` is registered by the [Shopify theme profile](../tutorials/shopify-theme-profile.md) (`profile: 'shopify_theme'`), not by the default `core` profile. A core engine can register it itself: `liquid.registerTag('layout', LayoutTag)`, with {@link LayoutTag} imported from the package root.

## Using a Layout

Introduce a layout template for the current template to render in. The directory for layout files is defined by {@link LiquidOptions.layouts | layouts} or {@link LiquidOptions.root | root}.

The page renders first, and the layout receives the result as `content_for_layout`:

```liquid
// default-layout.liquid
Header
{{ content_for_layout }}
Footer

// page.liquid
{% layout "default-layout.liquid" %}
My page content

// result
Header
My page content
Footer
```

If {@link LiquidOptions.extname | extname} option is set, the `.liquid` extension becomes optional:

```liquid
{% layout 'default-layout' %}
```

> **Scoping**
>
> When a partial template is rendered by the `layout` tag, its template has access to its caller's variables but not vice versa. Variables defined in `layout` will be popped out before control returns to its caller.

## Rendering Without a Layout

`{% layout none %}` renders the template on its own, with no outer layout:

```liquid
{% layout none %}My page content
```

## Passing Variables

Variables defined in the current template can be passed to the `layout` template by listing them as parameters on the `layout` tag:

```liquid
{% assign my_variable = 'apples' %}
{% layout 'name', my_variable: my_variable, my_other_variable: 'oranges' %}
```

## Outputs & Filters

When filename is specified as literal string, it supports Liquid output and filter syntax. Useful when concatenating strings for a complex filename.

```liquid
{% layout "prefix/{{name | append: '.html'}}" %}
```

> **Quotes**
>
> String literals have no escape sequences, so a `\"` cannot appear inside a `"`-quoted name. Quote the inner string with the other kind of quote, as above.

> **Named blocks were removed**
>
> The <code>block</code> inheritance tag no longer exists. See <a href="../tutorials/migrate-to-12.md">Migrate to v12</a> for the <code>content_for_layout</code> replacement.
