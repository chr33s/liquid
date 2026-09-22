---
title: Partials and Layouts
---

## Render Partials

For the following template files:

```
// file: color.liquid
color: '{{ color }}' shape: '{{ shape }}'

// file: theme.liquid
{% assign shape = 'circle' %}
{% render 'color.liquid' %}
{% render 'color.liquid' with 'red' %}
{% render 'color.liquid', color: 'yellow', shape: 'square' %}
```

The output will be:

```
color: '' shape: 'circle'
color: 'red' shape: 'circle'
color: 'yellow' shape: 'square'
```

For more details, see the [render](../tags/render.md) tag.

> **The &quot;.liquid&quot; Extension**
>
> The ".liquid" extension in <code>layout</code>, <code>render</code> and <code>include</code> can be omitted if Liquid instance is created using `extname: ".liquid"` option. See <a href="./options.md#extname">the extname option</a> for details.

## Layout Templates (Extends)

The `layout` tag belongs to the [Shopify theme profile](./shopify-theme-profile.md). Create the engine with `profile: 'shopify_theme'`, or register the tag on a core engine with `liquid.registerTag('layout', LayoutTag)`.

For the following template files:

```
// file: default-layout.liquid
Header
{{ content_for_layout }}
Footer

// file: page.liquid
{% layout "default-layout.liquid" %}
My page content
```

The output of `page.liquid`:

```
Header
My page content
Footer
```

For more details, see the [layout](../tags/layout.md) tag.
