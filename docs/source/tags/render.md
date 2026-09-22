---
title: render
---

**Since:** v9.2.0

## Render a Template

Render a partial template from partials directory specified by {@link LiquidOptions.partials | partials} or {@link LiquidOptions.root | root}.

```liquid
// index.liquid
Contents
{% render 'footer.liquid' %}

// footer.liquid
Footer

// result
Contents
Footer
```

If {@link LiquidOptions.extname | extname} option is set, the above `.liquid` extension becomes optional:

```liquid
{% render 'footer' %}
```

> **Variable Scope**
>
> When a partial template is rendered, the code inside it can't access its parent's variables and its variables won't be accessible by its parent. This encapsulation makes partials easier to understand and maintain.

## Passing Variables

Variables defined in the parent's scope can be passed to the partial template by listing them as parameters on the `render` tag:

```liquid
{% assign my_variable = 'apples' %}
{% render 'name', my_variable: my_variable, my_other_variable: 'oranges' %}
```

{@link LiquidOptions.globals | globals} don't need to be passed down. They are accessible from all files.

## Template Name

The template name must be a quoted string, and it is used literally: `{% render "prefix/{{ name }}" %}` looks up a file named `prefix/{{ name }}`. An unquoted name is rejected at parse time with `Syntax error in tag 'render' - Template name must be a quoted string`, or `Expected string but found id` under `errorMode: "strict2"`. To choose a partial at runtime, use [include](./include.md).
